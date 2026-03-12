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

function getUserId(req: NextRequest): string | null {
  // 1) Authorization header (best for API calls)
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const jwt = auth.slice(7).trim();
    const sub = tryGetUserIdFromJwt(jwt);
    if (sub) return sub;
  }

  // 2) Common Supabase SSR cookies
  const sbAccess = req.cookies.get("sb-access-token")?.value;
  if (sbAccess) {
    const sub = tryGetUserIdFromJwt(sbAccess);
    if (sub) return sub;
  }

  // 3) Supabase cookie that may contain JSON with access_token
  // Example: sb-<project-ref>-auth-token={"access_token":"..."}
  for (const c of req.cookies.getAll()) {
    if (!c.name.startsWith("sb-") || !c.name.endsWith("-auth-token")) continue;
    try {
      const parsed = JSON.parse(c.value);
      const token = parsed?.access_token;
      const sub = tryGetUserIdFromJwt(typeof token === "string" ? token : undefined);
      if (sub) return sub;
    } catch {
      // ignore
    }
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
          failClosed: true,
          dailyQuota: Number(process.env.QUOTA_BOOSTER_GENERATE_PER_DAY || 120),
        }
      : { tokens: 30, windowSeconds: 60, name: "booster-generate-read" };
  }

  if (pathname === "/api/templates/render") {
    return isWrite
      ? {
          tokens: Number(process.env.RL_TEMPLATES_RENDER_PER_MIN || 20),
          windowSeconds: 60,
          name: "templates-render-write",
          failClosed: true,
          dailyQuota: Number(process.env.QUOTA_TEMPLATES_RENDER_PER_DAY || 500),
        }
      : { tokens: 60, windowSeconds: 60, name: "templates-render-read" };
  }

  if (pathname === "/api/booster/publish-now") {
    return {
      tokens: Number(process.env.RL_PUBLISH_NOW_PER_MIN || 6),
      windowSeconds: 60,
      name: "publish-now",
      failClosed: true,
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

  const applyApiHeaders = (res: NextResponse) => {
    // Correlate request/response across Vercel logs + Sentry
    res.headers.set("x-request-id", requestId);
    // Avoid caching API responses at the edge/browser by default
    res.headers.set("cache-control", "no-store");
    // Prevent API endpoints from being indexed
    if (pathname.startsWith("/api/")) {
      res.headers.set("x-robots-tag", "noindex, nofollow");
    }
    return res;
  };

  // Skip callback routes (already protected at route-level)
  if (isOauthCallback(pathname)) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    return applyApiHeaders(res);
  }

  const userId = getUserId(req);

  if (!isPublicBypassPath(pathname)) {
    const maintenance = await getMaintenanceRow();
    const maintenanceEnabled = Boolean(maintenance?.maintenance_mode);

    if (maintenanceEnabled && userId) {
      const admin = await isAdminUser(userId);

      if (!admin) {
        if (pathname.startsWith("/api/")) {
          const out = NextResponse.json(
            {
              ok: false,
              error: "Maintenance in progress",
              maintenance: true,
              title: maintenance?.maintenance_title ?? null,
              message: maintenance?.maintenance_message ?? null,
            },
            { status: 503 }
          );
          out.headers.set("Retry-After", "300");
          return applyApiHeaders(out);
        }

        const url = req.nextUrl.clone();
        url.pathname = "/maintenance";
        url.search = "";
        const out = NextResponse.redirect(url, 307);
        return applyApiHeaders(out);
      }
    }
  }

  if (!pathname.startsWith("/api/")) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    return applyApiHeaders(res);
  }

  const ip = getIp(req);
  const lim = pickLimit(pathname, req.method);
  const identifier = userId ? `u:${userId}` : `ip:${ip}`;

  // Optional: quota enforcement (per-day). Only enabled for specific endpoints.
  if (lim.dailyQuota && lim.dailyQuota > 0) {
    const q = await enforceQuota({
      name: `mw:${lim.name}:day`,
      identifier,
      limit: lim.dailyQuota,
      periodSeconds: 60 * 60 * 24,
      failClosed: !!lim.failClosed,
    });
    if (q) return applyApiHeaders(q);
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
      return applyApiHeaders(res);
    }
  } catch (err) {
    // Fallback.
    if (lim.failClosed) {
      const out = NextResponse.json({ error: "Rate limiting unavailable" }, { status: 503 });
      out.headers.set("Retry-After", "5");
      return applyApiHeaders(out);
    }
    console.warn("[rateLimit] proxy disabled (fail-open)", err);
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  return applyApiHeaders(res);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
