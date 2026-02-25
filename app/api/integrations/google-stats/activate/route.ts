import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tryDecryptToken } from "@/lib/oauthCrypto";
function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

// POST /api/integrations/google-stats/activate
// Utilisé principalement en mode "rented" pour Site iNrCy :
// - Si un refresh_token Google est déjà présent en DB (integrations), on rafraîchit l'access_token
// - On résout automatiquement GA4 + GSC via le domaine du site
// - On remplit inrcy_site_configs.settings (ga4/gsc)

type TokenRefreshResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type SiteSettings = {
  ga4?: { property_id?: string; measurement_id?: string; verified_at?: string };
  gsc?: { property?: string; verified_at?: string };
};

function safeJsonParse<T>(s: unknown, fallback: T): T {
  if (!s) return fallback;
  try {
    if (typeof s === "string") return JSON.parse(s) as T;
    return s as T;
  } catch {
    return fallback;
  }
}

function extractDomainFromUrl(rawUrl: string): { normalizedUrl: string; domain: string } | null {
  try {
    const input = /^(https?:\/\/)/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const u = new URL(input);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = (u.hostname || "").toLowerCase().replace(/^www\./, "");
    if (!host) return null;
    u.hash = "";
    return { normalizedUrl: u.toString(), domain: host };
  } catch {
    return null;
  }
}

async function gaAdminFetch<T>(accessToken: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = (await res.json()) as unknown;
  if (!res.ok) {
    const rec = asRecord(data);
    const err = asRecord(rec["error"]);
    throw new Error(`GA4 Admin request failed: ${asString(err["message"]) || "unknown"}`);
  }
  return data as T;
}

type GaAccount = { name: string; displayName?: string };

async function fetchAllGa4Properties(accessToken: string) {
  const accountsData = await gaAdminFetch<{ accounts?: GaAccount[] }>(
    accessToken,
    "https://analyticsadmin.googleapis.com/v1beta/accounts?pageSize=200"
  );

  const accounts = accountsData.accounts ?? [];
  if (accounts.length === 0) return [];

  const props: Array<{ name: string; displayName?: string }> = [];
  for (const acc of accounts) {
    let pageToken: string | undefined = undefined;
    for (let i = 0; i < 50; i++) {
      const url = new URL("https://analyticsadmin.googleapis.com/v1beta/properties");
      url.searchParams.set("pageSize", "200");
      url.searchParams.set("filter", `parent:${acc.name}`);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const data = await gaAdminFetch<unknown>(accessToken, url.toString());
      const rec = asRecord(data);
      const rawProps = Array.isArray(rec["properties"]) ? rec["properties"] : [];
      for (const p of rawProps) {
        const pr = asRecord(p);
        const name = asString(pr["name"]);
        if (!name) continue;
        props.push({ name, displayName: asString(pr["displayName"]) ?? undefined });
      }
      pageToken = asString(rec["nextPageToken"]) ?? undefined;
      if (!pageToken) break;
    }
  }

  const seen = new Set<string>();
  return props.filter((p) => {
    if (!p?.name) return false;
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
}

async function fetchDataStreams(accessToken: string, propertyName: string) {
  const url = new URL(`https://analyticsadmin.googleapis.com/v1beta/${propertyName}/dataStreams`);
  url.searchParams.set("pageSize", "200");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = (await res.json()) as unknown;
  if (!res.ok) return [];
  const rec = asRecord(data);
  const raw = Array.isArray(rec["dataStreams"]) ? rec["dataStreams"] : [];
  return raw;
}

function normalizeDomainFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = (u.hostname || "").toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

function extractPropertyId(propertyName: string): string | null {
  const m = /^properties\/(\d+)$/.exec(propertyName);
  return m?.[1] ?? null;
}

function pickGa4Match(domain: string, candidates: Array<{ propertyId: string; measurementId?: string }>) {
  if (candidates.length === 0) throw new Error("Aucune propriété GA4 ne correspond à ce domaine.");
  if (candidates.length > 1) {
    throw new Error(
      "Plusieurs propriétés GA4 correspondent à ce domaine. Pour éviter une incohérence, l'application bloque la connexion."
    );
  }
  const c = candidates[0]!;
  if (!c.propertyId) throw new Error("Impossible d'extraire le Property ID GA4.");
  return { propertyId: c.propertyId, measurementId: c.measurementId ?? null };
}

async function resolveGa4FromDomain(accessToken: string, domain: string) {
  const properties = await fetchAllGa4Properties(accessToken);
  // Dédoublonnage: une propriété peut avoir plusieurs WEB streams.
  // On ne veut pas qu'un même propertyId compte plusieurs fois (sinon faux "ambiguous").
  const byProperty = new Map<string, { propertyId: string; measurementId?: string }>();

  for (const p of properties) {
    const pid = extractPropertyId(p.name);
    if (!pid) continue;
    const streams = await fetchDataStreams(accessToken, p.name);
    for (const s of streams) {
      const sr = asRecord(s);
      if (String(asString(sr["type"]) || "").toUpperCase() !== "WEB_DATA_STREAM") continue;
      const web = asRecord(sr["webStreamData"]);
      const defaultUri = asString(web["defaultUri"]);
      const measurementId = asString(web["measurementId"]) ?? undefined;
      if (!defaultUri) continue;
      const d = normalizeDomainFromUrl(String(defaultUri));
      if (!d) continue;
      const host = d.replace(/^www\./, "");
      const wanted = domain.replace(/^www\./, "");
      if (host === wanted) {
        if (!byProperty.has(pid)) byProperty.set(pid, { propertyId: pid, measurementId });
        const cur = byProperty.get(pid)!;
        if (!cur.measurementId && measurementId) cur.measurementId = measurementId;
      }
    }
  }

  return pickGa4Match(domain, Array.from(byProperty.values()));
}

async function resolveGscFromDomain(accessToken: string, domain: string, siteUrlHint?: string | null) {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = (await res.json()) as unknown;
  const rec = asRecord(data);
  if (!res.ok) {
    const err = asRecord(rec["error"]);
    throw new Error(`GSC sites.list failed: ${asString(err["message"]) || "unknown"}`);
  }

  const rawEntries = Array.isArray(rec["siteEntry"]) ? rec["siteEntry"] : [];
  const entries: Array<{ siteUrl: string }> = rawEntries
    .map((e) => asRecord(e))
    .map((e) => ({ siteUrl: asString(e["siteUrl"]) || "" }))
    .filter((e) => Boolean(e.siteUrl));
  const wantedScDomain = `sc-domain:${domain}`;
  const exactScDomain = entries.find((e) => String(e.siteUrl).toLowerCase() === wantedScDomain.toLowerCase());
  if (exactScDomain) return exactScDomain.siteUrl;

  const urlCandidates = entries
    .map((e) => String(e.siteUrl))
    .filter((u) => u.startsWith("http://") || u.startsWith("https://"));

  if (siteUrlHint) {
    const hint = siteUrlHint.endsWith("/") ? siteUrlHint : `${siteUrlHint}/`;
    const hit = urlCandidates.find((u) => (u.endsWith("/") ? u : `${u}/`) === hint);
    if (hit) return hit;
  }

  for (const u of urlCandidates) {
    try {
      const host = new URL(u).hostname.toLowerCase().replace(/^www\./, "");
      if (host === domain.replace(/^www\./, "")) return u;
    } catch {}
  }

  throw new Error(
    "Aucune propriété Search Console ne correspond à ce domaine sur ce compte Google. Ajoute le domaine dans Search Console (ou donne accès à ce compte), puis relance l'activation."
  );
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = asRecord((await req.json().catch(() => ({}))) as unknown);
    const source = asString(body["source"]) ?? "site_inrcy";
    if (source !== "site_inrcy") {
      return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    }

    // siteUrl peut être fourni par le front ; sinon on le prend en DB
    let siteUrl = String(asString(body["siteUrl"]) ?? "").trim();
    if (!siteUrl) {
      const { data: row } = await supabase
        .from("inrcy_site_configs")
        .select("site_url")
        .eq("user_id", authData.user.id)
        .maybeSingle();
      siteUrl = String(asString(asRecord(row)["site_url"]) ?? "").trim();
    }

    const parsed = extractDomainFromUrl(siteUrl);
    if (!parsed) {
      return NextResponse.json({ error: "Site URL invalid or missing" }, { status: 400 });
    }

    // ✅ Mode rented : on utilise le compte Google admin iNrCy (token global) pour activer le suivi.
    // Le client ne doit jamais voir d'écran OAuth.
    // Le token admin est identifié soit par INRCY_ADMIN_USER_ID (recommandé), soit par l'email du compte Google admin.
    const { data: prof } = await supabase
      .from("profiles")
      .select("inrcy_site_ownership")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    const profRec = asRecord(prof);
    const ownership = asString(profRec["inrcy_site_ownership"]) ?? "none";
    if (ownership !== "rented") {
      return NextResponse.json({ error: "Activation réservée au mode rented." }, { status: 403 });
    }

    const adminEmail = (process.env.INRCY_ADMIN_GOOGLE_EMAIL || "contact@admin-inrcy.com").trim().toLowerCase();
    const adminUserId = (process.env.INRCY_ADMIN_USER_ID || "").trim();

    // On cherche un refresh_token admin (n'importe quelle source/product) stocké dans integrations.
    // ⚠️ On privilégie user_id si fourni, sinon on se rabat sur email_address.
    
let adminRefreshToken = "";
{
  const baseQuery = supabaseAdmin.from("integrations").select("refresh_token_enc").eq("provider", "google");
  const q = adminUserId ? baseQuery.eq("user_id", adminUserId) : baseQuery.ilike("email_address", adminEmail);
  const { data: rows } = await q
    .not("refresh_token_enc", "is", null)
    .order("updated_at", { ascending: false })
    .limit(10);
  const rowWithToken = Array.isArray(rows)
    ? rows.find((r) => {
        const rr = asRecord(r);
        const t = asString(rr["refresh_token_enc"]);
        return !!(t && t.trim());
      })
    : undefined;
  const raw = (asString(asRecord(rowWithToken)["refresh_token_enc"]) ?? "").trim();
  adminRefreshToken = tryDecryptToken(raw) || "";
}
    if (!adminRefreshToken) {
      return NextResponse.json(
        {
          error:
            "Aucun token Google admin iNrCy n'est configuré. Connecte d'abord le compte contact@admin-inrcy.com (OAuth offline) pour générer un refresh_token.",
        },
        { status: 500 }
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET" }, { status: 500 });
    }

    // Refresh token -> access token (admin iNrCy)
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: adminRefreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    });

    const tokenData = (await tokenRes.json()) as TokenRefreshResponse;
    if (!tokenRes.ok || !tokenData.access_token) {
      return NextResponse.json({ error: tokenData?.error_description || "Token refresh failed" }, { status: 500 });
    }

    const accessToken = tokenData.access_token;
    const _expiresAt =
      tokenData.expires_in != null ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString() : null;

    // Resolve GA4 + GSC
    const domain = parsed.domain.toLowerCase().replace(/^www\./, "");
    const [ga4Resolved, gscResolved] = await Promise.all([
      resolveGa4FromDomain(accessToken, domain),
      resolveGscFromDomain(accessToken, domain, parsed.normalizedUrl),
    ]);

    // ✅ On marque l'intégration comme connectée pour CE client,
    // sans jamais stocker le refresh_token admin sur son user_id.
    const nowIso = new Date().toISOString();
    const base = {
      user_id: authData.user.id,
      provider: "google",
      source: "site_inrcy",
      status: "connected",
      // pas de tokens sur la ligne client
      access_token_enc: null,
      refresh_token_enc: null,
      expires_at: null,
      email_address: adminEmail,
      meta: { uses_admin: true },
    } as unknown;

    // Upsert en deux temps (plus tolérant si la contrainte unique n'est pas présente)
    for (const product of ["ga4", "gsc"] as const) {
      const { data: existing } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", authData.user.id)
        .eq("provider", "google")
        .eq("source", "site_inrcy")
        .eq("product", product)
        .maybeSingle();

      const payload = { ...base, product } as unknown;
      if ((existing as unknown)?.id) {
        await supabase
          .from("integrations")
          .update(payload)
          .eq("id", (existing as Record<string, unknown>)?.id as string);
      } else {
        await supabase.from("integrations").insert(payload);
      }
    }

    // Persist binding in inrcy_site_configs.settings
    const { data: cfg } = await supabase
      .from("inrcy_site_configs")
      .select("settings")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    const current = safeJsonParse<SiteSettings>((cfg as unknown)?.settings, {});
    const next: SiteSettings = { ...(current ?? {}) };
    next.ga4 = {
      ...(next.ga4 ?? {}),
      property_id: ga4Resolved.propertyId,
      measurement_id: ga4Resolved.measurementId ?? undefined,
      verified_at: nowIso,
    };
    next.gsc = { ...(next.gsc ?? {}), property: gscResolved, verified_at: nowIso };
    // En mode RENTED, on garde GA4/GSC branchés, mais on peut couper/réactiver la couche iNrCy.
    asRecord(next)["inrcy_tracking_enabled"] = true;

    const { error: upErr } = await supabase
      .from("inrcy_site_configs")
      .upsert({ user_id: authData.user.id, site_url: parsed.normalizedUrl, settings: next }, { onConflict: "user_id" });
    if (upErr) return NextResponse.json({ error: "DB update failed" }, { status: 500 });

    // Invalider le cache stats pour rafraîchir immédiatement les KPI après activation.
    try {
      await supabase.from("stats_cache").delete().eq("user_id", authData.user.id).eq("source", "overview");
    } catch {}

    return NextResponse.json({ ok: true, ga4: ga4Resolved, gsc: { property: gscResolved } });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)) || "Unknown error" }, { status: 500 });
  }
}