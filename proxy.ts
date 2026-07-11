// proxy.ts
import { NextRequest, NextResponse } from "next/server";

import { enforceQuota, enforceRateLimit } from "./lib/rateLimit";

const ADMIN_USER_IDS = ["670b527d-5e08-42b4-ba95-e58e812339eb"] as const;

type MaintenanceRow = {
  maintenance_mode?: boolean;
  maintenance_title?: string | null;
  maintenance_message?: string | null;
  updated_at?: string | null;
};

type SubscriptionGateRow = {
  status?: string | null;
  trial_end_at?: string | null;
  start_date?: string | null;
};

const TRIAL_DURATION_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeSubscriptionStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function parseDateMs(value?: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isTrialStillValid(subscription?: SubscriptionGateRow | null): boolean {
  if (normalizeSubscriptionStatus(subscription?.status) !== "trialing") return false;

  const trialEndMs = parseDateMs(subscription?.trial_end_at);
  if (trialEndMs !== null) return trialEndMs > Date.now();

  const startMs = parseDateMs(subscription?.start_date);
  if (startMs !== null) return startMs + TRIAL_DURATION_DAYS * DAY_MS > Date.now();

  return false;
}

function isAllowedSubscription(subscription?: SubscriptionGateRow | null): boolean {
  const status = normalizeSubscriptionStatus(subscription?.status);
  return status === "active" || isTrialStillValid(subscription);
}

function getEffectiveSubscriptionStatus(subscription?: SubscriptionGateRow | null): string {
  const status = normalizeSubscriptionStatus(subscription?.status);
  if (status === "trialing" && !isTrialStillValid(subscription)) return "trial_expired";
  return status;
}

const SENSITIVE_API_PREFIXES = [
  "/api/account",
  "/api/agent",
  "/api/billing",
  "/api/booster",
  "/api/bubble-access",
  "/api/calendar",
  "/api/crm",
  "/api/dashboard",
  "/api/documents",
  "/api/factures",
  "/api/fideliser",
  "/api/generator",
  "/api/inbox",
  "/api/inrbadge/settings",
  "/api/inr-search",
  "/api/inrsend",
  "/api/inrstats",
  "/api/integrations",
  "/api/loyalty",
  "/api/media",
  "/api/metrics",
  "/api/notifications",
  "/api/profile",
  "/api/propulser",
  "/api/referrals",
  "/api/stats",
  "/api/templates",
] as const;

const API_BLOCK_BYPASS_PREFIXES = [
  "/api/auth/",
  "/api/billing/checkout",
  "/api/boutique/order",
  "/api/cron/",
  "/api/csp-report",
  "/api/health",
  "/api/inrbadge/appointment-request",
  "/api/inrbadge/lead",
  "/api/inrsend/unsubscribe",
  "/api/inrsend/webhooks/",
  "/api/public/",
  "/api/security/google/risc",
  "/api/stripe/webhook",
  "/api/widgets/",
] as const;

function pathMatches(pathname: string, candidate: string): boolean {
  const normalizedCandidate = candidate.endsWith("/") ? candidate.slice(0, -1) : candidate;
  return pathname === normalizedCandidate || pathname.startsWith(`${normalizedCandidate}/`);
}

function isApiBlockBypassPath(pathname: string): boolean {
  return API_BLOCK_BYPASS_PREFIXES.some((candidate) => pathMatches(pathname, candidate));
}

function isSensitiveApiPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/") || isApiBlockBypassPath(pathname)) return false;
  return SENSITIVE_API_PREFIXES.some((candidate) => pathMatches(pathname, candidate));
}

function blockedAccountApiResponse(subscription?: SubscriptionGateRow | null): NextResponse {
  return NextResponse.json(
    {
      error: "ACCOUNT_BLOCKED",
      code: "ACCOUNT_BLOCKED",
      status: getEffectiveSubscriptionStatus(subscription),
      redirectTo: "/compte-bloque",
      message: "Compte bloqué : contactez iNrCy pour réactiver votre générateur.",
    },
    { status: 403 }
  );
}

function getIp(req: NextRequest): string {
  // Vercel provides req.ip, but keep fallbacks for local/dev/proxies.
  const direct = (req as unknown as { ip?: string }).ip;
  if (direct) return direct;

  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";

  const xrip = req.headers.get("x-real-ip");
  if (xrip) return xrip;

  return "unknown";
}

function isOauthCallback(pathname: string): boolean {
  // These routes already have per-route rate limits (Step A).
  return pathname.startsWith("/api/integrations/") && pathname.endsWith("/callback");
}

function base64UrlDecode(input: string): string {
  // base64url -> base64
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");

  // Edge: atob exists. Node: use Buffer.
  if (typeof atob === "function") {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  return Buffer.from(b64, "base64").toString("utf-8");
}

function tryGetJwtPayload(jwt?: string): Record<string, unknown> | null {
  if (!jwt) return null;
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

function tryGetUserIdFromJwt(jwt?: string): string | null {
  const payload = tryGetJwtPayload(jwt);
  return typeof payload?.sub === "string" ? payload.sub : null;
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function tryDecodeBase64Utf8(value: string): string | null {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (normalized.length % 4)) % 4);

  try {
    if (typeof atob === "function") {
      const bin = atob(normalized + pad);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }

    return Buffer.from(normalized + pad, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

function collectJwtCandidates(value: string): string[] {
  const raw = stripWrappingQuotes(decodeCookieValue(value).trim());
  const candidates = new Set<string>();

  const push = (candidate: unknown) => {
    if (typeof candidate !== "string") return;
    const cleaned = stripWrappingQuotes(candidate.trim());
    if (!cleaned) return;

    if (tryGetUserIdFromJwt(cleaned)) {
      candidates.add(cleaned);
      return;
    }

    if (cleaned.startsWith("base64-")) {
      const decoded = tryDecodeBase64Utf8(cleaned.slice(7));
      if (decoded) {
        for (const nested of collectJwtCandidates(decoded)) candidates.add(nested);
      }
      return;
    }

    const decoded = tryDecodeBase64Utf8(cleaned);
    if (decoded && decoded !== cleaned) {
      for (const nested of collectJwtCandidates(decoded)) candidates.add(nested);
      return;
    }

    const parsed = tryParseJson(cleaned);
    if (Array.isArray(parsed)) {
      const arr = parsed as unknown[];
      push(arr[0]);
      for (const item of arr) {
        if (item && typeof item === "object") {
          push((item as Record<string, unknown>).access_token);
        }
      }
      return;
    }

    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      push(obj.access_token);
      push(
        obj.currentSession && typeof obj.currentSession === "object"
          ? (obj.currentSession as Record<string, unknown>).access_token
          : null
      );
      push(
        obj.session && typeof obj.session === "object"
          ? (obj.session as Record<string, unknown>).access_token
          : null
      );
      return;
    }
  };

  push(raw);
  return [...candidates];
}

function getJwtCandidates(req: NextRequest): string[] {
  const candidates = new Set<string>();

  const pushCandidate = (candidate: unknown) => {
    if (typeof candidate !== "string") return;
    const cleaned = candidate.trim();
    if (!cleaned || !tryGetUserIdFromJwt(cleaned)) return;
    candidates.add(cleaned);
  };

  // 1) Authorization header (best for API calls)
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    pushCandidate(auth.slice(7).trim());
  }

  // 2) Common direct cookies
  const directCookieNames = [
    "sb-access-token",
    "supabase-auth-token",
  ] as const;

  for (const name of directCookieNames) {
    const value = req.cookies.get(name)?.value;
    if (!value) continue;
    for (const candidate of collectJwtCandidates(value)) {
      pushCandidate(candidate);
    }
  }

  // 3) Supabase SSR cookies, including chunked cookies such as:
  //    sb-<project>-auth-token
  //    sb-<project>-auth-token.0 / .1 / .2 ...
  const grouped = new Map<string, Array<{ index: number; value: string }>>();

  for (const cookie of req.cookies.getAll()) {
    if (!cookie.name.startsWith("sb-") || !cookie.name.includes("-auth-token")) continue;

    const match = cookie.name.match(/^(.*-auth-token)(?:\.(\d+))?$/);
    if (!match) continue;

    const baseName = match[1];
    const index = Number(match[2] ?? 0);
    const current = grouped.get(baseName) ?? [];
    current.push({ index, value: cookie.value });
    grouped.set(baseName, current);
  }

  for (const parts of grouped.values()) {
    const combined = parts
      .sort((a, b) => a.index - b.index)
      .map((part) => part.value)
      .join("");

    for (const candidate of collectJwtCandidates(combined)) {
      pushCandidate(candidate);
    }
  }

  return [...candidates];
}

type SupabaseAuthUser = {
  id?: string | null;
};

function isJwtExpired(jwt: string): boolean {
  const payload = tryGetJwtPayload(jwt);
  if (typeof payload?.exp !== "number") return false;
  return payload.exp * 1000 <= Date.now();
}

async function verifySupabaseJwt(jwt: string): Promise<string | null> {
  const payloadSub = tryGetUserIdFromJwt(jwt);
  if (!payloadSub || isJwtExpired(jwt)) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${jwt}`,
      },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const user = (await res.json()) as SupabaseAuthUser;
    return user.id === payloadSub ? user.id : null;
  } catch {
    return null;
  }
}

async function getUserId(req: NextRequest): Promise<string | null> {
  for (const jwt of getJwtCandidates(req)) {
    const verifiedUserId = await verifySupabaseJwt(jwt);
    if (verifiedUserId) return verifiedUserId;
  }

  return null;
}

function getSupabaseHeaders(): HeadersInit | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = serviceRoleKey || anonKey;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !token) return null;

  return {
    apikey: token,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function getSubscriptionGateRow(userId: string): Promise<SubscriptionGateRow | null> {
  try {
    const headers = getSupabaseHeaders();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!headers || !supabaseUrl) return null;

    const url = new URL(`${supabaseUrl}/rest/v1/subscriptions`);
    url.searchParams.set("select", "status,trial_end_at,start_date");
    url.searchParams.set("user_id", `eq.${userId}`);
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      headers,
      cache: "no-store",
    });

    if (!res.ok) return null;
    const rows = (await res.json()) as SubscriptionGateRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function getMaintenanceRow(): Promise<MaintenanceRow | null> {
  try {
    const headers = getSupabaseHeaders();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!headers || !supabaseUrl) return null;

    const url = new URL(`${supabaseUrl}/rest/v1/app_settings`);
    url.searchParams.set(
      "select",
      "maintenance_mode,maintenance_title,maintenance_message,updated_at"
    );
    url.searchParams.set("id", "eq.1");
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      headers,
      cache: "no-store",
    });

    if (!res.ok) return null;
    const rows = (await res.json()) as MaintenanceRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function isAdminUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  if (ADMIN_USER_IDS.includes(userId as (typeof ADMIN_USER_IDS)[number])) return true;

  try {
    const headers = getSupabaseHeaders();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!headers || !supabaseUrl) return false;

    const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
    url.searchParams.set("select", "role");
    url.searchParams.set("user_id", `eq.${userId}`);
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      headers,
      cache: "no-store",
    });

    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ role?: string | null }>;
    const role = rows[0]?.role;
    return role === "admin" || role === "staff";
  } catch {
    return false;
  }
}

function isPublicBypassPath(pathname: string): boolean {
  return (
    pathname === "/maintenance" ||
    pathname === "/favicon.ico" ||
    pathname === "/site.webmanifest" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/widgets/") ||
    pathname.startsWith("/api/health")
  );
}

type LimitPlan = {
  tokens: number;
  windowSeconds: number;
  name: string;
  /** block when KV/rate limiter is unavailable */
  failClosed?: boolean;
  /** optional daily quota (requests per day) */
  dailyQuota?: number;
};

function pickLimit(pathname: string, method: string): LimitPlan {
  const m = method.toUpperCase();
  const isWrite = m !== "GET" && m !== "HEAD" && m !== "OPTIONS";

  // --- EXPENSIVE / COST-SENSITIVE endpoints (protect OpenAI + external publish costs)
  // Fail-CLOSED here to avoid getting billed/spammed if KV is down.
  if (pathname === "/api/booster/generate") {
    return isWrite
      ? {
          tokens: Number(process.env.RL_BOOSTER_GENERATE_PER_MIN || 8),
          windowSeconds: 60,
          name: "booster-generate-write",
          failClosed: false,
        }
      : { tokens: 30, windowSeconds: 60, name: "booster-generate-read" };
  }

  if (pathname === "/api/booster/transcribe") {
    return isWrite
      ? {
          tokens: Number(process.env.RL_BOOSTER_TRANSCRIBE_PER_MIN || 6),
          windowSeconds: 60,
          name: "booster-transcribe-write",
          // Keep vocal usable if KV / rate limiting is unavailable.
          failClosed: false,
          dailyQuota: Number(process.env.QUOTA_BOOSTER_TRANSCRIBE_PER_DAY || 120),
        }
      : { tokens: 30, windowSeconds: 60, name: "booster-transcribe-read" };
  }

  if (pathname === "/api/templates/render") {
    return isWrite
      ? {
          tokens: Number(process.env.RL_TEMPLATES_RENDER_PER_MIN || 20),
          windowSeconds: 60,
          name: "templates-render-write",
          // Keep template autofill available even if KV / rate limiting is unavailable.
          failClosed: false,
          dailyQuota: Number(process.env.QUOTA_TEMPLATES_RENDER_PER_DAY || 500),
        }
      : { tokens: 60, windowSeconds: 60, name: "templates-render-read" };
  }

  if (pathname === "/api/booster/publish-now") {
    return {
      tokens: Number(process.env.RL_PUBLISH_NOW_PER_MIN || 6),
      windowSeconds: 60,
      name: "publish-now",
      // Keep publication available even if KV / rate limiting is unavailable.
      failClosed: false,
      dailyQuota: Number(process.env.QUOTA_PUBLISH_NOW_PER_DAY || 80),
    };
  }

  // Public-ish widget token issuance should be tight per IP.
  if (pathname === "/api/widgets/issue-token") {
    return {
      tokens: Number(process.env.RL_WIDGET_ISSUE_TOKEN_PER_MIN || 30),
      windowSeconds: 60,
      name: "widget-issue-token",
      // Allow fail-open here to avoid breaking embeds if KV is down.
      failClosed: false,
      dailyQuota: Number(process.env.QUOTA_WIDGET_ISSUE_TOKEN_PER_DAY || 2000),
    };
  }

  // Default limits
  return isWrite
    ? { tokens: 30, windowSeconds: 60, name: "write" }
    : { tokens: 120, windowSeconds: 60, name: "read" };
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // --- Light security hardening (safe defaults)
  // 1) Block weird HTTP methods early.
  const method = req.method.toUpperCase();
  const allowed = new Set(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]);
  if (!allowed.has(method)) {
    return new NextResponse("Method Not Allowed", {
      status: 405,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  // 2) Enforce https in production when possible (Vercel sets x-forwarded-proto).
  // This should not trigger on normal Vercel traffic.
  if (process.env.NODE_ENV === "production") {
    const proto = req.headers.get("x-forwarded-proto");
    if (proto && proto !== "https") {
      const url = req.nextUrl.clone();
      url.protocol = "https:";
      return NextResponse.redirect(url, 308);
    }
  }

  // Correlation ID (visible to client + used in server logs)
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  const applyResponseHeaders = (res: NextResponse) => {
    // Correlate request/response across Vercel logs + Sentry
    res.headers.set("x-request-id", requestId);

    // Avoid serving stale documents from browser/edge cache.
    // This is important for maintenance mode toggles to take effect on a simple refresh.
    const isDocumentRequest =
      !pathname.startsWith("/api/") &&
      (req.headers.get("sec-fetch-dest") === "document" ||
        req.headers.get("accept")?.includes("text/html"));

    const isIndexablePublicDocument = pathname === "/entreprises" || pathname.startsWith("/entreprises/");
    const isInrSearchCompanyDocument = pathname.startsWith("/entreprises/");

    if (pathname.startsWith("/api/")) {
      res.headers.set("cache-control", "no-store");
      res.headers.set("x-robots-tag", "noindex, nofollow");
    } else if (isDocumentRequest && isInrSearchCompanyDocument) {
      // A newly provisioned iNr’Search page must never inherit a cached 404.
      res.headers.set("cache-control", "no-store, max-age=0");
      res.headers.delete("pragma");
      res.headers.delete("expires");
    } else if (isDocumentRequest && isIndexablePublicDocument) {
      res.headers.set("cache-control", "public, s-maxage=60, stale-while-revalidate=300");
      res.headers.delete("pragma");
      res.headers.delete("expires");
    } else if (isDocumentRequest) {
      res.headers.set("cache-control", "private, no-store, no-cache, max-age=0, must-revalidate");
      res.headers.set("pragma", "no-cache");
      res.headers.set("expires", "0");
    }

    return res;
  };

  let userId: string | null | undefined;
  let subscriptionGate: SubscriptionGateRow | null | undefined;

  const getCurrentUserId = async () => {
    if (userId !== undefined) return userId;
    userId = await getUserId(req);
    return userId;
  };

  const getCurrentSubscriptionGate = async () => {
    const currentUserId = await getCurrentUserId();
    if (!currentUserId) return null;
    if (subscriptionGate !== undefined) return subscriptionGate;
    subscriptionGate = await getSubscriptionGateRow(currentUserId);
    return subscriptionGate;
  };

  const isDashboardPath = pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  if (isDashboardPath && !isPublicBypassPath(pathname)) {
    const maintenance = await getMaintenanceRow();
    const maintenanceEnabled = Boolean(maintenance?.maintenance_mode);

    if (maintenanceEnabled) {
      const currentUserId = await getCurrentUserId();
      const admin = currentUserId ? await isAdminUser(currentUserId) : false;

      if (!admin) {
        const url = req.nextUrl.clone();
        url.pathname = "/maintenance";
        url.search = "";
        const out = NextResponse.redirect(url, 307);
        return applyResponseHeaders(out);
      }
    }

    if (await getCurrentUserId()) {
      const currentSubscriptionGate = await getCurrentSubscriptionGate();

      if (!isAllowedSubscription(currentSubscriptionGate)) {
        const url = req.nextUrl.clone();
        url.pathname = "/compte-bloque";
        url.search = "";
        const out = NextResponse.redirect(url, 307);
        return applyResponseHeaders(out);
      }
    }
  }

  if (!pathname.startsWith("/api/")) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    return applyResponseHeaders(res);
  }

  const isSensitiveApi = isSensitiveApiPath(pathname);

  if (req.method.toUpperCase() !== "OPTIONS" && isSensitiveApi) {
    const currentUserId = await getCurrentUserId();
    const currentSubscriptionGate = currentUserId ? await getCurrentSubscriptionGate() : null;

    if (currentUserId && !isAllowedSubscription(currentSubscriptionGate)) {
      return applyResponseHeaders(blockedAccountApiResponse(currentSubscriptionGate));
    }
  }

  // OAuth callbacks bypass rate limiting, but not the blocked-account guard above.
  if (isOauthCallback(pathname)) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    return applyResponseHeaders(res);
  }

  const ip = getIp(req);
  const lim = pickLimit(pathname, req.method);
  const currentUserId = userId ?? null;
  const identifier = currentUserId ? `u:${currentUserId}` : `ip:${ip}`;

  // Optional: quota enforcement (per-day). Only enabled for specific endpoints.
  if (lim.dailyQuota && lim.dailyQuota > 0) {
    const q = await enforceQuota({
      name: `mw:${lim.name}:day`,
      identifier,
      limit: lim.dailyQuota,
      periodSeconds: 60 * 60 * 24,
      failClosed: !!lim.failClosed,
    });
    if (q) return applyResponseHeaders(q);
  }

  // NOTE: enforceRateLimit() takes a single config object.
  // We keep a stable identifier per IP + path so users don't share buckets.
  try {
    const res = await enforceRateLimit({
      name: `mw:${lim.name}`,
      identifier: `${pathname}:${identifier}`,
      limit: lim.tokens,
      window: `${lim.windowSeconds} s`,
      failClosed: !!lim.failClosed,
    });
    if (res) {
      return applyResponseHeaders(res);
    }
  } catch (err) {
    // Fallback.
    if (lim.failClosed) {
      const out = NextResponse.json({ error: "Rate limiting unavailable" }, { status: 503 });
      out.headers.set("Retry-After", "5");
      return applyResponseHeaders(out);
    }
    console.warn("[rateLimit] proxy disabled (fail-open)", err);
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  return applyResponseHeaders(res);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
