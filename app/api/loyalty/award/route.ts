// app/api/loyalty/award/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { computeInertiaSnapshot } from "@/lib/loyalty/inertia";
import { hasActiveInrcySite } from "@/lib/inrcySite";

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

// Actions déclenchées en arrière-plan par l'UI.
// Lorsqu'une limite/cooldown est déjà atteinte, on préfère répondre 200
// avec un statut "skipped" plutôt que remonter un 429 côté navigateur,
// car cela crée un bruit console non bloquant en CI/E2E.
const SOFT_LIMIT_ACTION_KEYS = new Set([
  "account_open",
  "monthly_seniority",
  "profile_complete",
  "activity_complete",
]);

type TurboSupabaseLike = {
  from: (_table: string) => {
    select: (_query: string) => {
      eq: (_column: string, _value: string) => {
        maybeSingle: () => Promise<{ data: unknown | null }>;
        in: (_column: string, _values: string[]) => Promise<{ data: unknown[] | null }>;
      };
    };
  };
};

type TurboProfileRow = { inrcy_site_ownership?: string | null };
type TurboInrcyConfigRow = { site_url?: string | null };
type TurboProConfigRow = { settings?: { site_web?: { url?: string | null } } | null };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}


async function getTurboMultiplier(supabase: TurboSupabaseLike, userId: string) {
  // Reprise de la logique de /api/booster/connected-channels (source of truth)
  const [profileRes, inrcyCfgRes, proCfgRes, integRes] = await Promise.all([
    supabase.from("profiles").select("inrcy_site_ownership").eq("user_id", userId).maybeSingle(),
    supabase.from("inrcy_site_configs").select("site_url").eq("user_id", userId).maybeSingle(),
    supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
    supabase
      .from("integrations")
      .select("provider,status,resource_id,source,product")
      .eq("user_id", userId)
      .in("provider", ["google", "facebook", "instagram", "linkedin"]),
  ]);

  const profile = (profileRes.data ?? {}) as TurboProfileRow;
  const inrcyCfg = (inrcyCfgRes.data ?? {}) as TurboInrcyConfigRow;
  const proCfg = (proCfgRes.data ?? {}) as TurboProConfigRow;
  const settings = asRecord(proCfg.settings);
  const siteWebSettings = asRecord(settings["site_web"]);
  const siteWebUrl = String(siteWebSettings["url"] ?? "").trim();

  const ownership = String(profile.inrcy_site_ownership ?? "none");
  const inrcyUrl = String(inrcyCfg.site_url ?? "").trim();

  const rows = (integRes.data ?? []) as Array<{ provider: string; status: string; resource_id: string | null; source?: string | null; product?: string | null }>;

  const hasGoogleStats = (source: "site_inrcy" | "site_web") => {
    const hasGa4 = rows.some((r) => r.provider === "google" && r.status === "connected" && r.source === source && r.product === "ga4");
    const hasGsc = rows.some((r) => r.provider === "google" && r.status === "connected" && r.source === source && r.product === "gsc");
    return hasGa4 && hasGsc;
  };

  const channels = {
    site_inrcy: hasActiveInrcySite(ownership) && !!inrcyUrl && hasGoogleStats("site_inrcy"),
    site_web: !!siteWebUrl && hasGoogleStats("site_web"),
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
    turbo = await getTurboMultiplier(supabase as unknown as TurboSupabaseLike, userData.user.id);
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

    const isSoftLimited =
      SOFT_LIMIT_ACTION_KEYS.has(actionKey) &&
      ["COOLDOWN", "DAILY_POINTS_CAP", "DAILY_COUNT_CAP", "GLOBAL_DAILY_POINTS_CAP"].includes(norm.code);

    if (isSoftLimited) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        code: norm.code,
        balance: null,
        updatedAt: null,
      });
    }

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