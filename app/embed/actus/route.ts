import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { asRecord } from "@/lib/tsSafe";

export const runtime = "nodejs";

type WidgetTokenPayload = {
  v: 1;
  domain: string;
  source: string;
  iat: number;
  exp: number;
};

function b64urlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecodeToBuffer(s: string) {
  const pad = s.length % 4;
  const base64 = (s + (pad ? "=".repeat(4 - pad) : ""))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

function verifyWidgetToken(token: string, secret: string): WidgetTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid token format");
  const [body, sig] = parts;
  const expected = b64urlEncode(crypto.createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(b64urlDecodeToBuffer(body).toString("utf8")) as WidgetTokenPayload;
  if (!payload || payload.v !== 1) throw new Error("Invalid token payload");
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) throw new Error("Token expired");
  return payload;
}

function normalizeDomain(input: string | null): string {
  if (!input) return "";
  let raw = input.trim();
  try {
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    const u = new URL(raw);
    return (u.hostname || "").toLowerCase().replace(/^www\./, "");
  } catch {
    return raw
      .toLowerCase()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./, "")
      .split("/")[0];
  }
}

function getRefererHost(req: Request): string {
  const ref = req.headers.get("referer") || "";
  if (!ref) return "";
  try {
    return new URL(ref).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function resolveUserIdFromDomain(domain: string, source: string) {
  const supabase = getSupabaseAdmin();

  if (source === "inrcy_site") {
    const { data, error } = await supabase
      .from("inrcy_site_configs")
      .select("user_id, site_url")
      .ilike("site_url", `%${domain}%`)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return (asRecord(data)["user_id"] as string | null) ?? null;
  }

  const { data, error } = await supabase
    .from("pro_tools_configs")
    .select("user_id, settings")
    .limit(200);

  if (error) throw error;

  const rows = (data || []) as unknown[];
  const match = rows.find((r) => {
    const rr = asRecord(r);
    const settings = asRecord(rr["settings"]);
    const siteWeb = asRecord(settings["site_web"]);
    const url = String(siteWeb["url"] ?? "");
    return normalizeDomain(url) === domain;
  });

  return (asRecord(match)["user_id"] as string | null) ?? null;
}

async function fetchArticles(domain: string, source: string, limit: number) {
  const userId = await resolveUserIdFromDomain(domain, source);
  if (!userId) return [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("site_articles")
    .select("id, created_at, title, content, images")
    .eq("user_id", userId)
    .eq("source", source)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as Array<Record<string, unknown>>;
}

function escapeHtml(input: unknown) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeAttr(input: unknown) {
  return escapeHtml(input);
}

function parseArrayLike(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((x) => String(x || "")).filter(Boolean);
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x || "")).filter(Boolean);
    } catch {}
    if (raw.startsWith("{") && raw.endsWith("}")) {
      return raw
        .slice(1, -1)
        .split(",")
        .map((x) => x.replace(/^"+|"+$/g, "").trim())
        .filter(Boolean);
    }
  }
  return [];
}

function formatDate(iso: unknown) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(String(iso)));
  } catch {
    return "";
  }
}

function excerpt(input: unknown, max = 180) {
  const raw = String(input ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max).trim()}…`;
}

function renderHtml(params: {
  title: string;
  domain: string;
  articles: Array<Record<string, unknown>>;
}) {
  const { title, domain, articles } = params;

  const items = articles
    .map((article, index) => {
      const img = parseArrayLike(article.images)[0] || "";
      const date = formatDate(article.created_at);
      const articleTitle = String(article.title ?? "Actualité");
      const content = excerpt(article.content, 190);
      const thumb = img
        ? `<div class="thumb"><img src="${safeAttr(img)}" alt="" loading="lazy" /></div>`
        : `<div class="thumb thumb--fallback" aria-hidden="true"><span>iNrCy</span></div>`;

      return `
        <article class="item">
          <div class="itemIndex">${String(index + 1).padStart(2, "0")}</div>
          ${thumb}
          <div class="body">
            <div class="metaRow">
              <span class="badge">Booster</span>
              ${date ? `<time class="date">${escapeHtml(date)}</time>` : ""}
            </div>
            <h2 class="headline">${escapeHtml(articleTitle)}</h2>
            ${content ? `<p class="content">${escapeHtml(content)}</p>` : ""}
          </div>
        </article>
      `;
    })
    .join("");

  const empty = `
    <section class="empty">
      <div class="emptyIcon">✦</div>
      <h2>Aucune actualité pour le moment</h2>
      <p>Les 5 dernières publications envoyées depuis Booster apparaîtront ici automatiquement.</p>
    </section>
  `;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root{
      color-scheme: light;
      --bg: #f4f8ef;
      --panel: rgba(255,255,255,.92);
      --panel-2: rgba(246,250,241,.98);
      --stroke: rgba(44,86,22,.12);
      --stroke-2: rgba(44,86,22,.18);
      --text: #122014;
      --muted: rgba(18,32,20,.68);
      --brand: #63cf4e;
      --brand-2: #3d9e2e;
      --shadow: 0 14px 38px rgba(39,72,22,.10);
    }
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:transparent;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--text)}
    body{padding:0}
    .shell{
      width:100%;
      margin:0;
      padding:16px;
      background:
        radial-gradient(circle at top left, rgba(99,207,78,.18), transparent 32%),
        linear-gradient(180deg, rgba(255,255,255,.95), rgba(244,248,239,.96));
      border:1px solid var(--stroke);
      border-radius:24px;
      box-shadow: var(--shadow);
      overflow:hidden;
    }
    .hero{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:12px;
      margin-bottom:14px;
      padding:4px 2px 10px;
      border-bottom:1px solid rgba(44,86,22,.08);
    }
    .eyebrow{
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding:8px 12px;
      border-radius:999px;
      background:rgba(99,207,78,.12);
      color:#245a19;
      font-size:12px;
      font-weight:800;
      letter-spacing:.02em;
      text-transform:uppercase;
    }
    .dot{
      width:8px;height:8px;border-radius:999px;background:var(--brand);
      box-shadow:0 0 0 5px rgba(99,207,78,.14);
    }
    .title{
      margin:12px 0 6px;
      font-size:28px;
      line-height:1.05;
      letter-spacing:-.03em;
      font-weight:900;
    }
    .sub{
      margin:0;
      color:var(--muted);
      font-size:14px;
      line-height:1.55;
      max-width:56ch;
    }
    .sitePill{
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding:10px 14px;
      border-radius:999px;
      border:1px solid var(--stroke);
      background:rgba(255,255,255,.72);
      color:var(--muted);
      font-size:12px;
      font-weight:700;
      white-space:nowrap;
    }
    .list{
      display:grid;
      gap:12px;
      margin-top:10px;
    }
    .item{
      display:grid;
      grid-template-columns: auto 96px minmax(0,1fr);
      gap:14px;
      align-items:start;
      padding:14px;
      background:linear-gradient(180deg,var(--panel),var(--panel-2));
      border:1px solid var(--stroke);
      border-radius:20px;
      transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;
    }
    .item:hover{
      transform:translateY(-1px);
      border-color:var(--stroke-2);
      box-shadow:0 10px 24px rgba(39,72,22,.08);
    }
    .itemIndex{
      width:42px;height:42px;border-radius:14px;
      display:grid;place-items:center;
      background:linear-gradient(180deg, rgba(99,207,78,.18), rgba(99,207,78,.08));
      color:#2b6720;
      font-weight:900;
      font-size:13px;
      letter-spacing:.06em;
      border:1px solid rgba(99,207,78,.16);
      margin-top:2px;
    }
    .thumb{
      width:96px;height:96px;border-radius:18px;overflow:hidden;background:#e8efe0;border:1px solid rgba(44,86,22,.08);
    }
    .thumb img{display:block;width:100%;height:100%;object-fit:cover}
    .thumb--fallback{
      display:grid;place-items:center;
      background:linear-gradient(135deg, rgba(99,207,78,.18), rgba(61,158,46,.12));
      color:#2f6d23;
      font-size:14px;font-weight:900;letter-spacing:-.02em;
    }
    .body{min-width:0}
    .metaRow{
      display:flex;align-items:center;gap:8px;flex-wrap:wrap;
      margin-bottom:8px;
    }
    .badge{
      display:inline-flex;align-items:center;
      padding:5px 9px;border-radius:999px;
      background:#0f1f12;color:#fff;font-size:11px;font-weight:800;letter-spacing:.03em;
      text-transform:uppercase;
    }
    .date{
      font-size:12px;color:var(--muted);font-weight:700;
    }
    .headline{
      margin:0 0 8px;
      font-size:20px;
      line-height:1.18;
      letter-spacing:-.025em;
      font-weight:900;
    }
    .content{
      margin:0;
      font-size:14px;
      line-height:1.65;
      color:var(--muted);
      display:-webkit-box;
      -webkit-line-clamp:3;
      -webkit-box-orient:vertical;
      overflow:hidden;
    }
    .footer{
      margin-top:14px;
      padding-top:14px;
      border-top:1px solid rgba(44,86,22,.08);
      display:flex;
      justify-content:space-between;
      gap:10px;
      align-items:center;
      color:var(--muted);
      font-size:12px;
      flex-wrap:wrap;
    }
    .footer strong{color:#214c19}
    .empty{
      border:1px dashed rgba(44,86,22,.18);
      border-radius:22px;
      padding:28px 18px;
      text-align:center;
      background:rgba(255,255,255,.72);
    }
    .emptyIcon{
      width:56px;height:56px;border-radius:18px;margin:0 auto 12px;
      display:grid;place-items:center;
      background:rgba(99,207,78,.15);
      color:#2d6a22;font-size:22px;font-weight:900;
    }
    .empty h2{margin:0 0 8px;font-size:22px;line-height:1.15;letter-spacing:-.03em}
    .empty p{margin:0;color:var(--muted);font-size:14px;line-height:1.6}
    @media (max-width: 700px){
      .shell{padding:14px;border-radius:22px}
      .hero{flex-direction:column;align-items:flex-start}
      .title{font-size:24px}
      .item{
        grid-template-columns: 1fr;
        gap:12px;
      }
      .itemIndex{order:0}
      .thumb{width:100%;height:180px}
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="hero">
      <div>
        <div class="eyebrow"><span class="dot"></span> Actus iNrCy</div>
        <h1 class="title">${escapeHtml(title)}</h1>
        <p class="sub">Les 5 dernières actualités publiées depuis Booster sont affichées automatiquement sur votre site.</p>
      </div>
      <div class="sitePill">${escapeHtml(domain)}</div>
    </header>

    <main class="list">
      ${items || empty}
    </main>

    <footer class="footer">
      <span>Publication automatique depuis <strong>Booster</strong></span>
      <span>Affichage limité aux <strong>5 dernières actus</strong></span>
    </footer>
  </div>
</body>
</html>`;
}

function htmlResponse(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Content-Security-Policy":
        "default-src 'none'; img-src https: data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors *;",
    },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const domain = normalizeDomain(searchParams.get("domain"));
    const source = (searchParams.get("source") || "site_web").trim();
    const title = (searchParams.get("title") || "Actualités").trim();
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "5", 10) || 5, 1), 5);
    const token = searchParams.get("token") || "";

    if (!domain) return htmlResponse(renderHtml({ title, domain: "site inconnu", articles: [] }), 400);
    if (source !== "inrcy_site" && source !== "site_web") {
      return htmlResponse(renderHtml({ title, domain, articles: [] }), 400);
    }
    if (!token) {
      return htmlResponse(renderHtml({ title, domain, articles: [] }), 401);
    }

    const signingSecret = process.env.INRCY_WIDGETS_SIGNING_SECRET;
    if (!signingSecret) throw new Error("Missing INRCY_WIDGETS_SIGNING_SECRET");

    const tok = verifyWidgetToken(token, signingSecret);
    const tokDomain = normalizeDomain(tok.domain);
    const tokSource = String(tok.source || "").trim();

    if (tokDomain !== domain || tokSource !== source) {
      return htmlResponse(renderHtml({ title, domain, articles: [] }), 403);
    }

    const refHost = getRefererHost(req);
    if (refHost && refHost !== tokDomain) {
      return htmlResponse(renderHtml({ title, domain, articles: [] }), 403);
    }

    const articles = await fetchArticles(domain, source, limit);
    return htmlResponse(renderHtml({ title, domain, articles }), 200);
  } catch {
    return htmlResponse(renderHtml({ title: "Actualités", domain: "iNrCy", articles: [] }), 500);
  }
}
