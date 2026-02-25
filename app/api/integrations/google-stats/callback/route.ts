import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { encryptToken as _encryptToken } from "@/lib/oauthCrypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  id?: string;
  email?: string;
  name?: string;
  picture?: string;
};

const ALLOWED_SOURCES = ["site_inrcy", "site_web"] as const;
const ALLOWED_PRODUCTS = ["ga4", "gsc"] as const;

function safeJsonParse<T>(s: unknown, fallback: T): T {
  if (!s) return fallback;
  try {
    if (typeof s === "string") return JSON.parse(s) as T;
    return s as T;
  } catch {
    return fallback;
  }
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

async function gaAdminFetch<T>(accessToken: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = (await res.json()) as unknown;
  if (!res.ok) {
    throw new Error(`GA4 Admin request failed: ${data?.error?.message || "unknown"}`);
  }
  return data as T;
}

type GaAccount = { name: string; displayName?: string };
type _GaProperty = { name: string; displayName?: string };

async function fetchAllGa4Properties(accessToken: string) {
  const accountsData = await gaAdminFetch<{ accounts?: GaAccount[] }>(
    accessToken,
    "https://analyticsadmin.googleapis.com/v1beta/accounts?pageSize=200"
  );

  const accounts = accountsData.accounts ?? [];
  if (accounts.length === 0) return [];

  const props: Array<{ name: string; displayName?: string }> = [];
  // List properties per account because `properties.list` requires a `filter=parent:accounts/XXXX`.
  for (const acc of accounts) {
    let pageToken: string | undefined = undefined;
    for (let i = 0; i < 50; i++) {
      const url = new URL("https://analyticsadmin.googleapis.com/v1beta/properties");
      url.searchParams.set("pageSize", "200");
      url.searchParams.set("filter", `parent:${acc.name}`);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const data = await gaAdminFetch<unknown>(accessToken, url.toString());
      for (const p of data?.properties ?? []) props.push({ name: p?.name, displayName: p?.displayName });
      pageToken = data?.nextPageToken;
      if (!pageToken) break;
    }
  }

  // De-duplicate by property name
  const seen = new Set<string>();
  return props.filter((p) => {
    if (!p?.name) return false;
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
}

async function fetchDataStreams(accessToken: string, propertyName: string) {
  // propertyName is usually "properties/123"
  const url = new URL(`https://analyticsadmin.googleapis.com/v1beta/${propertyName}/dataStreams`);
  url.searchParams.set("pageSize", "200");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = (await res.json()) as unknown;
  if (!res.ok) {
    // Do not fail the whole activation on a single property; just ignore.
    return [];
  }

  return (data?.dataStreams ?? []) as unknown[];
}

function extractPropertyId(propertyName: string): string | null {
  const m = /^properties\/(\d+)$/.exec(propertyName);
  return m?.[1] ?? null;
}

function pickGa4Match(domain: string, candidates: Array<{ propertyId: string; measurementId?: string; defaultUri?: string }>) {
  if (candidates.length === 0) return { ok: false as const, reason: "Aucune propriété GA4 ne correspond à ce domaine." };
  if (candidates.length > 1) {
    return {
      ok: false as const,
      reason:
        "Plusieurs propriétés GA4 correspondent à ce domaine. Pour éviter une incohérence, l'application bloque la connexion. (Nettoie / unifie les propriétés GA4 ou contacte le support.)",
    };
  }
  const c = candidates[0]!;
  if (!c.propertyId) return { ok: false as const, reason: "Impossible d'extraire le Property ID GA4." };
  return { ok: true as const, propertyId: c.propertyId, measurementId: c.measurementId ?? null };
}

async function resolveGa4FromDomain(accessToken: string, domain: string) {
  const properties = await fetchAllGa4Properties(accessToken);

  const matches: Array<{ propertyId: string; measurementId?: string; defaultUri?: string }> = [];

  for (const p of properties) {
    const pid = extractPropertyId(p.name);
    if (!pid) continue;

    const streams = await fetchDataStreams(accessToken, p.name);
    for (const s of streams) {
      if (String(s?.type || "").toUpperCase() !== "WEB_DATA_STREAM") continue;

      const defaultUri = s?.webStreamData?.defaultUri || s?.webStreamData?.defaultUri;
      const measurementId = s?.webStreamData?.measurementId;

      if (!defaultUri) continue;
      const d = normalizeDomainFromUrl(String(defaultUri));
      if (!d) continue;

      const dNorm = d.replace(/^www\./, "");
      const target = domain.replace(/^www\./, "");

      if (dNorm === target) {
        matches.push({ propertyId: pid, measurementId, defaultUri });
      }
    }
  }

  const picked = pickGa4Match(domain, matches);
  if (!picked.ok) throw new Error(picked.reason);

  return { propertyId: picked.propertyId, measurementId: picked.measurementId };
}

async function resolveGscFromDomain(accessToken: string, domain: string, siteUrlHint?: string | null) {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = (await res.json()) as unknown;
  if (!res.ok) {
    throw new Error(`GSC sites.list failed: ${data?.error?.message || "unknown"}`);
  }

  const entries: Array<{ siteUrl: string; permissionLevel?: string }> = data?.siteEntry ?? [];

  const wantedScDomain = `sc-domain:${domain}`;
  const exactScDomain = entries.find((e) => String(e.siteUrl).toLowerCase() === wantedScDomain.toLowerCase());
  if (exactScDomain) return exactScDomain.siteUrl;

  // Try URL-prefix properties
  const normalizedTarget = domain.replace(/^www\./, "");
  const urlCandidates = entries
    .map((e) => String(e.siteUrl))
    .filter((u) => u.startsWith("http://") || u.startsWith("https://"));

  // Prefer the saved site URL if it matches
  if (siteUrlHint) {
    const hint = siteUrlHint.endsWith("/") ? siteUrlHint : `${siteUrlHint}/`;
    const hit = urlCandidates.find((u) => (u.endsWith("/") ? u : `${u}/`) === hint);
    if (hit) return hit;
  }

  // Otherwise match by hostname
  for (const u of urlCandidates) {
    try {
      const host = new URL(u).hostname.toLowerCase().replace(/^www\./, "");
      if (host === normalizedTarget) return u;
    } catch {}
  }

  throw new Error(
    "Aucune propriété Search Console ne correspond à ce domaine sur ce compte Google. Ajoute le domaine dans Search Console (ou donne accès à ce compte), puis relance l'activation."
  );
}


async function validateGa4Binding(accessToken: string, domain: string, propertyId: string, measurementId?: string | null) {
  const propertyName = `properties/${propertyId}`;
  const streams = await fetchDataStreams(accessToken, propertyName);
  const target = domain.replace(/^www\./, "");
  for (const s of streams) {
    if (String(s?.type || "").toUpperCase() !== "WEB_DATA_STREAM") continue;
    const mid = s?.webStreamData?.measurementId;
    const defaultUri = s?.webStreamData?.defaultUri;
    const d = defaultUri ? normalizeDomainFromUrl(String(defaultUri)) : null;
    if (!d) continue;
    const dNorm = d.replace(/^www\./, "");
    if (dNorm !== target) continue;
    if (measurementId && String(mid || "").trim() !== String(measurementId).trim()) continue;
    return { ok: true as const, measurementId: mid ?? null };
  }
  return { ok: false as const };
}

function validateGscPropertyAgainstDomain(domain: string, property: string) {
  const d = domain.replace(/^www\./, "").toLowerCase();
  const p = String(property || "").trim().toLowerCase();
  if (!p) return false;
  if (p === `sc-domain:${d}`) return true;
  if (p.startsWith("http://") || p.startsWith("https://")) {
    try {
      const host = new URL(p).hostname.toLowerCase().replace(/^www\./, "");
      return host === d;
    } catch {
      return false;
    }
  }
  return false;
}
type SiteSettings = {
  ga4?: { property_id?: string; measurement_id?: string; verified_at?: string };
  gsc?: { property?: string; verified_at?: string };
  site_web?: {
    url?: string;
    ga4?: { property_id?: string; measurement_id?: string; verified_at?: string };
    gsc?: { property?: string; verified_at?: string };
  };
};

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServer>>;

async function upsertGoogleIntegration(opts: {
  supabase: SupabaseServerClient;
  userId: string;
  source: "site_inrcy" | "site_web";
  product: "ga4" | "gsc";
  tokenData: TokenResponse;
  userInfo: GoogleUserInfo;
}) {
  const { supabase, userId, source, product, tokenData, userInfo } = opts;

  const { data: existing } = await supabase
    .from("integrations")
    .select("id,refresh_token_enc")
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("source", source)
    .eq("product", product)
    .maybeSingle();

  const refreshTokenToStore = tokenData.refresh_token ?? (existing as unknown)?.refresh_token_enc ?? null;

  const expiresAt =
    tokenData.expires_in != null
      ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
      : null;

  const payload: Record<string, unknown> = {
    user_id: userId,
    provider: "google",
    category: "stats",
    source,
    product,
    status: "connected",
    email_address: userInfo.email,
    display_name: userInfo.name ?? null,
    provider_account_id: userInfo.id ?? null,
    scopes: tokenData.scope ?? null,
    access_token_enc: tokenData.access_token ?? null,
    refresh_token_enc: refreshTokenToStore,
    expires_at: expiresAt,
    meta: { picture: userInfo.picture ?? null },
  };

  // IMPORTANT: OAuth callbacks may be called multiple times (retries / reconnect).
  // Use UPSERT against the unique key to avoid duplicate key errors.
  // NOTE: `integrations_unique` enforces uniqueness on (user_id, provider, source, product).
  const { error: upsertErr } = await supabase
    .from("integrations")
    .upsert(payload, { onConflict: "user_id,provider,source,product" });

  if (upsertErr) {
    const msg = upsertErr.message || JSON.stringify(upsertErr);
    if (msg.includes("no unique or exclusion constraint matching the ON CONFLICT specification")) {
      throw new Error(
        "DB upsert failed: l'index UNIQUE n'est pas aligné. " +
          "Crée/remplace l'index integrations_unique sur (user_id, provider, source, product). Détail: " +
          msg
      );
    }
    throw new Error(`DB upsert failed: ${msg}`);
  }
}

export async function GET(req: Request) {
  try {
    const urlObj = new URL(req.url);
    const code = urlObj.searchParams.get("code");
    const stateRaw = urlObj.searchParams.get("state");

    if (!code) return NextResponse.json({ error: "Missing ?code" }, { status: 400 });
    if (!stateRaw) return NextResponse.json({ error: "Missing ?state" }, { status: 400 });

    let state: unknown = null;
    try {
      state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8"));
    } catch {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }

    const source = state?.source;
    const product = state?.product;
    const returnTo = state?.returnTo || "/dashboard";
    const mode = state?.mode || "";
    const domainFromState = (state?.domain || "") as string;
    const siteUrlFromState = (state?.siteUrl || "") as string;

    if (!ALLOWED_SOURCES.includes(source)) {
      return NextResponse.json({ error: "Invalid state.source" }, { status: 400 });
    }
    if (!ALLOWED_PRODUCTS.includes(product)) {
      return NextResponse.json({ error: "Invalid state.product" }, { status: 400 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectFromEnv = process.env.GOOGLE_STATS_REDIRECT_URI;
    const origin = new URL(req.url).origin;
    const redirectUri = redirectFromEnv || `${origin}/api/integrations/google-stats/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET" }, { status: 500 });
    }

    // Use session client only to read the current user (auth cookies).
    const sessionSupabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await sessionSupabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const userId = authData.user.id;

    // Rate limit OAuth callbacks (prevents abuse + accidental double-callbacks)
    const rlUser = await enforceRateLimit({
      name: `oauth_google_stats_cb_${product}`,
      identifier: userId,
      limit: 10,
      window: "10 m",
    });
    if (rlUser) return rlUser;

    const ip = getClientIp(req);
    const rlIp = await enforceRateLimit({
      name: `oauth_google_stats_cb_ip_${product}`,
      identifier: ip,
      limit: 20,
      window: "10 m",
    });
    if (rlIp) return rlIp;

    // Use admin client for DB writes/reads to avoid RLS issues in OAuth callbacks.
    const supabase = supabaseAdmin;

    // Exchange code -> tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenRes.json()) as TokenResponse;
    if (!tokenRes.ok) {
      return NextResponse.json({ error: "Token exchange failed", tokenData }, { status: 500 });
    }

    // Userinfo
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = (await userRes.json()) as GoogleUserInfo;

    if (!userRes.ok || !userInfo?.email) {
      return NextResponse.json({ error: "Userinfo fetch failed", userInfo }, { status: 500 });
    }

    // Default behavior: connect the requested product only.
    // Activation behavior: connect BOTH ga4 & gsc + resolve correct bindings from configured domain.
    if (mode === "activate") {
      const domain = String(domainFromState || "").trim().toLowerCase().replace(/^www\./, "");
      if (!domain) {
        return NextResponse.redirect(new URL(`${returnTo}&ok=0&error=missing_domain`, origin));
      }
      if (!tokenData.access_token) {
        return NextResponse.redirect(new URL(`${returnTo}&ok=0&error=missing_access_token`, origin));
      }

      // Upsert both integrations with the same token payload
      await upsertGoogleIntegration({ supabase, userId, source, product: "ga4", tokenData, userInfo });
      await upsertGoogleIntegration({ supabase, userId, source, product: "gsc", tokenData, userInfo });

      // Resolve GA4 + GSC to match the configured domain
      const [ga4Resolved, gscResolved] = await Promise.all([
        resolveGa4FromDomain(tokenData.access_token, domain),
        resolveGscFromDomain(tokenData.access_token, domain, siteUrlFromState || null),
      ]);

      // Persist the binding in DB (nouveau schéma)
// - site_inrcy -> inrcy_site_configs.settings
// - site_web -> pro_tools_configs.settings.site_web

const [inrcyCfgRes, proCfgRes] = await Promise.all([
  supabase.from("inrcy_site_configs").select("settings").eq("user_id", userId).maybeSingle(),
  supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
]);

const nowIso = new Date().toISOString();
// NOTE: SiteSettings has only optional fields, so an empty object is a valid fallback.
// Using `null` breaks TS in production builds (null not assignable to SiteSettings).
const inrcySettings = safeJsonParse<SiteSettings>((inrcyCfgRes.data as unknown)?.settings, {});
const proSettings = safeJsonParse<unknown>((proCfgRes.data as unknown)?.settings, {});

if (source === "site_inrcy") {
  const next: SiteSettings = { ...(inrcySettings ?? {}) };
  next.ga4 = { ...(next.ga4 ?? {}), property_id: ga4Resolved.propertyId, measurement_id: ga4Resolved.measurementId ?? undefined, verified_at: nowIso };
  next.gsc = { ...(next.gsc ?? {}), property: gscResolved, verified_at: nowIso };

  const { error: upErr } = await supabase
    .from("inrcy_site_configs")
    .upsert({ user_id: userId, settings: next }, { onConflict: "user_id" });
  if (upErr) {
    return NextResponse.redirect(new URL(`${returnTo}&ok=0&error=db_update_settings`, origin));
  }
} else {
  const nextPro = { ...(proSettings ?? {}) };
  nextPro.site_web = {
    ...(nextPro.site_web ?? {}),
    url: siteUrlFromState || (nextPro.site_web?.url ?? ""),
    ga4: { ...((nextPro.site_web as unknown)?.ga4 ?? {}), property_id: ga4Resolved.propertyId, measurement_id: ga4Resolved.measurementId ?? undefined, verified_at: nowIso },
    gsc: { ...((nextPro.site_web as unknown)?.gsc ?? {}), property: gscResolved, verified_at: nowIso },
  };

  const { error: upErr } = await supabase
    .from("pro_tools_configs")
    .upsert({ user_id: userId, settings: nextPro }, { onConflict: "user_id" });
  if (upErr) {
    return NextResponse.redirect(new URL(`${returnTo}&ok=0&error=db_update_settings`, origin));
  }
}

return NextResponse.redirect(new URL(`${returnTo}&activated=1&ok=1`, origin));
    }

    // Non-activate: connect one product, but enforce / auto-resolve bindings for the configured site when possible.
    await upsertGoogleIntegration({ supabase, userId, source, product, tokenData, userInfo });

    // If we have a domain (passed from UI or activation flow), we can auto-resolve and/or enforce coherence.
    const domain = String(domainFromState || "").trim().toLowerCase().replace(/^www\./, "");
    const siteUrlHint = String(siteUrlFromState || "").trim();

    
if (domain && tokenData.access_token) {
      // Nouveau schéma :
      // - site_inrcy -> inrcy_site_configs.settings
      // - site_web -> pro_tools_configs.settings.site_web

      const [inrcyCfgRes, proCfgRes] = await Promise.all([
        supabase.from("inrcy_site_configs").select("settings").eq("user_id", userId).maybeSingle(),
        supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
      ]);

      const nowIso = new Date().toISOString();
      const inrcySettings = safeJsonParse<SiteSettings>((inrcyCfgRes.data as unknown)?.settings, {});
      const proSettings = safeJsonParse<unknown>((proCfgRes.data as unknown)?.settings, {});

      if (source === "site_web") {
        const nextPro = { ...(proSettings ?? {}) };
        nextPro.site_web = { ...(nextPro.site_web ?? {}) };
        // Prefer state hint (user just typed it), otherwise keep stored
        if (siteUrlHint) nextPro.site_web.url = siteUrlHint;

        if (product === "ga4") {
          const existingGa4 = (nextPro.site_web as unknown)?.ga4 ?? {};
          const existingPid = String(existingGa4?.property_id || "").trim();
          const existingMid = String(existingGa4?.measurement_id || "").trim();

          if (existingPid) {
            const v = await validateGa4Binding(tokenData.access_token, domain, existingPid, existingMid || null);
            if (!v.ok) {
              if (!existingMid) {
                const resolved = await resolveGa4FromDomain(tokenData.access_token, domain);
                nextPro.site_web = {
                  ...(nextPro.site_web ?? {}),
                  ga4: { ...((nextPro.site_web as unknown)?.ga4 ?? {}), property_id: resolved.propertyId, measurement_id: resolved.measurementId ?? undefined, verified_at: nowIso },
                };
              } else {
                return NextResponse.redirect(new URL(`${returnTo}&ok=0&error=ga4_mismatch_domain`, origin));
              }
            } else {
              if (!existingMid && v.measurementId) {
                nextPro.site_web = {
                  ...(nextPro.site_web ?? {}),
                  ga4: { ...((nextPro.site_web as unknown)?.ga4 ?? {}), measurement_id: v.measurementId, verified_at: nowIso },
                };
              }
            }
          } else {
            const resolved = await resolveGa4FromDomain(tokenData.access_token, domain);
            nextPro.site_web = {
              ...(nextPro.site_web ?? {}),
              ga4: { ...((nextPro.site_web as unknown)?.ga4 ?? {}), property_id: resolved.propertyId, measurement_id: resolved.measurementId ?? undefined, verified_at: nowIso },
            };
          }
        }

        if (product === "gsc") {
          const existingGsc = (nextPro.site_web as unknown)?.gsc ?? {};
          const existingProp = String(existingGsc?.property || "").trim();

          if (existingProp) {
            if (!validateGscPropertyAgainstDomain(domain, existingProp)) {
              return NextResponse.redirect(new URL(`${returnTo}&ok=0&error=gsc_mismatch_domain`, origin));
            }
            const gscOk = await resolveGscFromDomain(tokenData.access_token, domain, siteUrlHint || null).catch(() => null);
            if (!gscOk) {
              return NextResponse.redirect(new URL(`${returnTo}&ok=0&error=gsc_not_accessible`, origin));
            }
          } else {
            const resolvedProp = await resolveGscFromDomain(tokenData.access_token, domain, siteUrlHint || null);
            nextPro.site_web = {
              ...(nextPro.site_web ?? {}),
              gsc: { ...((nextPro.site_web as unknown)?.gsc ?? {}), property: resolvedProp, verified_at: nowIso },
            };
          }
        }

        const { error: upErr } = await supabase
          .from("pro_tools_configs")
          .upsert({ user_id: userId, settings: nextPro }, { onConflict: "user_id" });
        if (upErr) {
          return NextResponse.redirect(new URL(`${returnTo}&ok=0&error=db_update_settings`, origin));
        }
      } else {
        const next: SiteSettings = { ...(inrcySettings ?? {}) };

        if (product === "ga4") {
          const existingGa4 = next.ga4 ?? {};
          const existingPid = String(existingGa4?.property_id || "").trim();
          const existingMid = String(existingGa4?.measurement_id || "").trim();

          if (existingPid) {
            const v = await validateGa4Binding(tokenData.access_token, domain, existingPid, existingMid || null);
            if (!v.ok) {
              if (!existingMid) {
                const resolved = await resolveGa4FromDomain(tokenData.access_token, domain);
                next.ga4 = { ...(next.ga4 ?? {}), property_id: resolved.propertyId, measurement_id: resolved.measurementId ?? undefined, verified_at: nowIso };
              } else {
                return NextResponse.redirect(new URL(`${returnTo}&ok=0&error=ga4_mismatch_domain`, origin));
              }
            } else {
              if (!existingMid && v.measurementId) {
                next.ga4 = { ...(next.ga4 ?? {}), measurement_id: v.measurementId, verified_at: nowIso };
              }
            }
          } else {
            const resolved = await resolveGa4FromDomain(tokenData.access_token, domain);
            next.ga4 = { ...(next.ga4 ?? {}), property_id: resolved.propertyId, measurement_id: resolved.measurementId ?? undefined, verified_at: nowIso };
          }
        }

        if (product === "gsc") {
          const existingGsc = next.gsc ?? {};
          const existingProp = String(existingGsc?.property || "").trim();

          if (existingProp) {
            if (!validateGscPropertyAgainstDomain(domain, existingProp)) {
              return NextResponse.redirect(new URL(`${returnTo}&ok=0&error=gsc_mismatch_domain`, origin));
            }
            const gscOk = await resolveGscFromDomain(tokenData.access_token, domain, siteUrlHint || null).catch(() => null);
            if (!gscOk) {
              return NextResponse.redirect(new URL(`${returnTo}&ok=0&error=gsc_not_accessible`, origin));
            }
          } else {
            const resolvedProp = await resolveGscFromDomain(tokenData.access_token, domain, siteUrlHint || null);
            next.gsc = { ...(next.gsc ?? {}), property: resolvedProp, verified_at: nowIso };
          }
        }

        const { error: upErr } = await supabase
          .from("inrcy_site_configs")
          .upsert({ user_id: userId, settings: next }, { onConflict: "user_id" });
        if (upErr) {
          return NextResponse.redirect(new URL(`${returnTo}&ok=0&error=db_update_settings`, origin));
        }
      }
    }

    return NextResponse.redirect(new URL(`${returnTo}&linked=${product}&ok=1`, origin));

  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)) || "Unknown error" }, { status: 500 });
  }
}
