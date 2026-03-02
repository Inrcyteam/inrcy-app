// app/api/loyalty/award/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { computeInertiaSnapshot } from "@/lib/loyalty/inertia";

type AwardBody = {
  actionKey: string;
  amount: number;
  sourceId?: string | null;
  label?: string | null;
  meta?: Record<string, unknown> | null;
};

// Optionnel (recommandé) : liste blanche des actions autorisées
const ALLOWED_ACTION_KEYS = new Set([
  // Onboarding / profil
  "account_open",
  "profile_complete",
  "activity_complete",

  // Turbo UI (multiplicateur) : pas de points ici, mais on garde l'action si besoin plus tard
  "connect_channel",

  // Actions hebdo
  "create_actu",
  "weekly_feature_use",

  // Ancienneté
  "monthly_seniority",
]);


// Actions dont les gains sont multipliés par le Turbo UI
const MULTIPLIED_ACTION_KEYS = new Set([
  "create_actu",
  "weekly_feature_use",
  // (ajouter ici les futures actions de gains récurrents)
]);

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}


async function getTurboMultiplier(supabase: any, userId: string) {
  // Reprise de la logique de /api/booster/connected-channels (source of truth)
  const [profileRes, inrcyCfgRes, proCfgRes, integRes] = await Promise.all([
    supabase.from("profiles").select("inrcy_site_ownership,inrcy_site_url").eq("user_id", userId).maybeSingle(),
    supabase.from("inrcy_site_configs").select("site_url").eq("user_id", userId).maybeSingle(),
    supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
    supabase
      .from("integrations")
      .select("provider,status,resource_id")
      .eq("user_id", userId)
      .in("provider", ["google", "facebook", "instagram", "linkedin"]),
  ]);

  const profile = (profileRes.data ?? {}) as Record<string, any>;
  const inrcyCfg = (inrcyCfgRes.data ?? {}) as Record<string, any>;
  const proCfg = (proCfgRes.data ?? {}) as Record<string, any>;
  const settings = (proCfg.settings ?? {}) as Record<string, any>;
  const siteWebUrl = String((settings.site_web ?? {})?.url ?? "").trim();

  const ownership = String(profile.inrcy_site_ownership ?? "none");
  const inrcyUrl = String(profile.inrcy_site_url ?? inrcyCfg.site_url ?? "").trim();

  const rows = (integRes.data ?? []) as Array<{ provider: string; status: string; resource_id: string | null }>;

  const channels = {
    site_inrcy: ownership !== "none" && !!inrcyUrl,
    site_web: !!siteWebUrl,
    gmb: rows.some((r) => r.provider === "google" && r.status === "connected" && !!r.resource_id),
    facebook: rows.some((r) => r.provider === "facebook" && r.status === "connected" && !!r.resource_id),
    instagram: rows.some((r) => r.provider === "instagram" && r.status === "connected" && !!r.resource_id),
    linkedin: rows.some((r) => r.provider === "linkedin" && r.status === "connected"),
  };

  return computeInertiaSnapshot(channels, { maxMultiplier: 7 }).multiplier;
}

function normalizePgError(errMsg?: string) {
  const msg = (errMsg ?? "").toLowerCase();

  // Exceptions levées par ta fonction SQL
  if (msg.includes("cooldown")) return { code: "COOLDOWN", status: 429 };
  if (msg.includes("daily_points_cap")) return { code: "DAILY_POINTS_CAP", status: 429 };
  if (msg.includes("daily_count_cap")) return { code: "DAILY_COUNT_CAP", status: 429 };
  if (msg.includes("global_daily_points_cap")) return { code: "GLOBAL_DAILY_POINTS_CAP", status: 429 };
  if (msg.includes("not authenticated")) return { code: "UNAUTHENTICATED", status: 401 };

  return { code: "RPC_ERROR", status: 400 };
}

export async function POST(req: Request) {
  let body: AwardBody;

  try {
    body = (await req.json()) as AwardBody;
  } catch {
    return badRequest("Body JSON invalide.");
  }

  const actionKey = (body.actionKey ?? "").trim();
  const amount = Number(body.amount);

  if (!actionKey) return badRequest("actionKey manquant.");
  if (!Number.isFinite(amount) || amount === 0) return badRequest("amount invalide (doit être non nul).");

  // Pour l’instant on verrouille à du positif (récompenses/débits plus tard)
  if (amount < 0) return badRequest("amount négatif non autorisé pour le moment.");

  // Sécurité : évite que le front appelle n’importe quoi
  if (!ALLOWED_ACTION_KEYS.has(actionKey)) {
    return badRequest("actionKey non autorisée.");
  }

  const supabase = await createSupabaseServer();

  // Vérifie qu’on a un user connecté
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });
  }

  // Turbo UI : certains gains sont multipliés selon les canaux connectés.
  // On calcule côté serveur (anti-triche).
  let effectiveAmount = amount;
  let turbo = 1;
  try {
    turbo = await getTurboMultiplier(supabase, userData.user.id);
  } catch {
    turbo = 1;
  }
  if (MULTIPLIED_ACTION_KEYS.has(actionKey)) {
    // arrondi à l'entier le plus proche (UI = entier)
    effectiveAmount = Math.round(amount * turbo);
  }

  const { data, error } = await supabase.rpc("award_inertia_action", {
    p_action_key: actionKey,
    p_amount: effectiveAmount,
    p_source_id: body.sourceId ?? null,
    p_label: body.label ?? null,
    p_meta: { ...(body.meta ?? {}), turbo_multiplier: turbo, base_amount: amount },
  });

  if (error) {
    const norm = normalizePgError(error.message);
    return NextResponse.json(
      {
        ok: false,
        code: norm.code,
        error: error.message,
      },
      { status: norm.status }
    );
  }

  return NextResponse.json({
    ok: true,
    balance: data?.balance ?? null,
    updatedAt: data?.updated_at ?? null,
  });
}