import { NextRequest } from "next/server";

const ALLOWED_PREFIXES = ["/rest/v1/", "/auth/v1/", "/storage/v1/", "/functions/v1/"] as const;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "cookie",
]);
const REQUEST_HEADER_ALLOWLIST = new Set([
  "accept",
  "accept-language",
  "apikey",
  "authorization",
  "cache-control",
  "content-type",
  "if-match",
  "if-none-match",
  "prefer",
  "range",
  "x-client-info",
  "x-request-id",
  "x-supabase-api-version",
]);
const RESPONSE_HEADER_ALLOWLIST = new Set([
  "accept-ranges",
  "cache-control",
  "content-disposition",
  "content-encoding",
  "content-language",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
  "location",
  "range-unit",
  "vary",
  "x-supabase-api-version",
]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

function jsonError(message: string, status = 500) {
  return Response.json({ ok: false, error: message }, { status, headers: { "cache-control": "no-store" } });
}

function getSupabaseBaseUrl(): URL | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;

  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function buildTargetUrl(req: NextRequest, pathParts: string[] | undefined): URL | null {
  const base = getSupabaseBaseUrl();
  if (!base) return null;

  const safePath = `/${(pathParts || []).map((part) => encodeURIComponent(part)).join("/")}`;
  const pathname = safePath === "/" ? "" : safePath;

  if (!ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  const target = new URL(pathname + req.nextUrl.search, base.origin);
  if (target.origin !== base.origin) return null;

  return target;
}

function buildForwardHeaders(req: NextRequest): Headers {
  const headers = new Headers();

  for (const [key, value] of req.headers.entries()) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (!REQUEST_HEADER_ALLOWLIST.has(lower)) continue;
    headers.set(key, value);
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (anonKey) {
    if (!headers.has("apikey")) headers.set("apikey", anonKey);
    if (!headers.has("authorization")) headers.set("authorization", `Bearer ${anonKey}`);
  }

  headers.set("x-inrcy-network-compat", "1");

  return headers;
}

function buildResponseHeaders(upstream: Response): Headers {
  const headers = new Headers();

  for (const [key, value] of upstream.headers.entries()) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (!RESPONSE_HEADER_ALLOWLIST.has(lower)) continue;
    if (lower === "cache-control") continue;
    headers.set(key, value);
  }

  headers.set("cache-control", "no-store");
  headers.set("x-inrcy-network-compat", "1");

  return headers;
}

async function getForwardBody(req: NextRequest): Promise<ArrayBuffer | undefined> {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return undefined;

  const body = await req.arrayBuffer();
  return body.byteLength > 0 ? body : undefined;
}

async function handle(req: NextRequest, context: RouteContext) {
  if (req.method.toUpperCase() === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        allow: "GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE",
        "cache-control": "no-store",
      },
    });
  }

  const { path } = await context.params;
  const target = buildTargetUrl(req, path);

  if (!target) {
    return jsonError("Proxy Supabase iNrCy indisponible ou chemin non autorisé.", 400);
  }

  try {
    const upstream = await fetch(target.toString(), {
      method: req.method,
      headers: buildForwardHeaders(req),
      body: await getForwardBody(req),
      cache: "no-store",
      redirect: "manual",
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: buildResponseHeaders(upstream),
    });
  } catch (error) {
    console.error("[network-compat] Supabase proxy failed", error);
    return jsonError("Connexion Supabase impossible via le proxy iNrCy.", 502);
  }
}

export async function GET(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}

export async function HEAD(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}

export async function OPTIONS(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}

export async function POST(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}

export async function PUT(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}
