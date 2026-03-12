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

type LayoutMode = "list" | "carousel";

function b64urlEncode(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecodeToBuffer(s: string) {
  const pad = s.length % 4;
  const base64 = (s + (pad ? "=".repeat(4 - pad) : "")).replace(/-/g, "+").replace(/_/g, "/");
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
    return raw.toLowerCase().replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0];
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

  const { data, error } = await supabase.from("pro_tools_configs").select("user_id, settings").limit(200);
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

function renderRichText(input: unknown) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  const escaped = escapeHtml(raw).replace(/\r\n/g, "\n");
  return escaped
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function clampLimit(value: string | null) {
  const parsed = parseInt(value || "5", 10) || 5;
  return Math.min(7, Math.max(3, parsed));
}

function renderListItem(article: Record<string, unknown>, index: number) {
  const img = parseArrayLike(article.images)[0] || "";
  const date = formatDate(article.created_at);
  const articleTitle = String(article.title ?? "Actualité").trim() || "Actualité";
  const content = renderRichText(article.content);

  return `
    <article class="newsItem reveal" style="animation-delay:${Math.min(index * 90, 360)}ms">
      ${img ? `<div class="mediaWrap"><img class="media" src="${safeAttr(img)}" alt="" loading="lazy" /></div>` : ""}
      <div class="copy">
        ${date ? `<div class="date">${escapeHtml(date)}</div>` : ""}
        <h2 class="headline">${escapeHtml(articleTitle)}</h2>
        ${content ? `<div class="content">${content}</div>` : ""}
      </div>
    </article>
  `;
}

function renderCarouselItem(article: Record<string, unknown>, index: number) {
  const img = parseArrayLike(article.images)[0] || "";
  const date = formatDate(article.created_at);
  const articleTitle = String(article.title ?? "Actualité").trim() || "Actualité";
  const content = renderRichText(article.content);

  return `
    <article class="slide" data-slide>
      ${img ? `<div class="slideMediaWrap"><img class="slideMedia" src="${safeAttr(img)}" alt="" loading="lazy" /></div>` : ""}
      <div class="slideCopy">
        <div class="slideMeta">
          ${date ? `<div class="date">${escapeHtml(date)}</div>` : ""}
          <div class="count">${String(index + 1).padStart(2, "0")}</div>
        </div>
        <h2 class="headline headline--slide">${escapeHtml(articleTitle)}</h2>
        ${content ? `<div class="content content--slide">${content}</div>` : ""}
      </div>
    </article>
  `;
}

function renderHtml(params: {
  title: string;
  domain: string;
  articles: Array<Record<string, unknown>>;
  layout: LayoutMode;
  limit: number;
}) {
  const { title, articles, layout, limit } = params;
  const countText = `${limit} dernière${limit > 1 ? "s" : ""} actu${limit > 1 ? "s" : ""}`;

  const listItems = articles.map(renderListItem).join("");
  const carouselItems = articles.map(renderCarouselItem).join("");
  const dots = articles.map((_, i) => `<button class="dot" type="button" aria-label="Actu ${i + 1}" data-dot="${i}"></button>`).join("");

  const empty = `
    <section class="empty reveal">
      <div class="emptyGlow"></div>
      <h2>Aucune actualité pour le moment</h2>
      <p>Les nouvelles publications envoyées depuis Booster apparaîtront ici automatiquement.</p>
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
      --bg1:#f6fbf3;
      --bg2:#eef7e8;
      --surface:rgba(255,255,255,.82);
      --surface-strong:rgba(255,255,255,.94);
      --line:rgba(40,78,24,.10);
      --line-strong:rgba(40,78,24,.18);
      --text:#152315;
      --muted:rgba(21,35,21,.68);
      --brand:#63cf4e;
      --brand-deep:#2f7d2a;
      --shadow:0 26px 70px rgba(39,72,22,.10);
      --radius-xl:28px;
      --radius-lg:22px;
      --radius-md:18px;
    }
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:transparent;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--text)}
    body{padding:0}
    .shell{
      width:100%;
      padding:18px;
    }
    .frame{
      position:relative;
      overflow:hidden;
      border-radius:var(--radius-xl);
      border:1px solid var(--line);
      background:
        radial-gradient(circle at top left, rgba(99,207,78,.16), transparent 34%),
        radial-gradient(circle at top right, rgba(99,207,78,.08), transparent 26%),
        linear-gradient(180deg, var(--bg1), var(--bg2));
      box-shadow:var(--shadow);
    }
    .hero{
      padding:24px 24px 14px;
      display:grid;
      gap:10px;
    }
    .kicker{
      display:inline-flex;
      align-items:center;
      gap:9px;
      width:max-content;
      padding:8px 12px;
      border-radius:999px;
      background:rgba(99,207,78,.12);
      border:1px solid rgba(99,207,78,.14);
      color:#265f1f;
      font-size:12px;
      font-weight:800;
      letter-spacing:.04em;
      text-transform:uppercase;
    }
    .kickerDot{width:8px;height:8px;border-radius:999px;background:var(--brand);box-shadow:0 0 0 5px rgba(99,207,78,.16)}
    .title{margin:0;font-size:clamp(28px,4vw,40px);line-height:1;letter-spacing:-.04em;font-weight:900}
    .intro{margin:0;max-width:70ch;color:var(--muted);font-size:15px;line-height:1.7}
    .section{padding:8px 18px 20px}
    .stack{display:grid;gap:16px}
    .newsItem{
      display:grid;
      grid-template-columns:minmax(0, 220px) minmax(0,1fr);
      gap:18px;
      align-items:start;
      padding:18px;
      border-radius:var(--radius-lg);
      border:1px solid var(--line);
      background:linear-gradient(180deg, rgba(255,255,255,.86), rgba(255,255,255,.72));
      backdrop-filter: blur(8px);
      transition:transform .22s ease, border-color .22s ease, box-shadow .22s ease;
    }
    .newsItem:hover{transform:translateY(-2px);border-color:var(--line-strong);box-shadow:0 16px 36px rgba(39,72,22,.10)}
    .newsItem:not(:last-child){position:relative}
    .newsItem:not(:last-child)::after{content:"";position:absolute;left:24px;right:24px;bottom:-9px;height:1px;background:rgba(40,78,24,.06)}
    .mediaWrap{border-radius:20px;overflow:hidden;min-height:180px;background:rgba(99,207,78,.08);border:1px solid rgba(40,78,24,.08)}
    .media{display:block;width:100%;height:100%;object-fit:cover;aspect-ratio: 4 / 3}
    .copy{min-width:0}
    .date{font-size:12px;line-height:1;color:#2f7d2a;font-weight:800;letter-spacing:.04em;text-transform:uppercase;margin-bottom:10px}
    .headline{margin:0 0 12px;font-size:clamp(24px,3.2vw,32px);line-height:1.07;letter-spacing:-.04em;font-weight:900}
    .headline--slide{font-size:clamp(22px,3vw,30px)}
    .content{display:grid;gap:12px;color:var(--muted);font-size:16px;line-height:1.72}
    .content p{margin:0}
    .carouselShell{display:grid;gap:16px}
    .controls{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
    .controlButtons{display:flex;gap:10px;align-items:center}
    .controlBtn{
      width:46px;height:46px;border-radius:999px;border:1px solid var(--line);
      background:rgba(255,255,255,.8);color:var(--text);font-size:18px;font-weight:900;cursor:pointer;
      transition:transform .2s ease, background .2s ease, border-color .2s ease;
    }
    .controlBtn:hover{transform:translateY(-1px);background:rgba(255,255,255,.96);border-color:var(--line-strong)}
    .controlBtn:disabled{opacity:.45;cursor:not-allowed;transform:none}
    .dots{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .dot{width:10px;height:10px;border-radius:999px;border:0;background:rgba(47,125,42,.18);cursor:pointer;transition:all .2s ease;padding:0}
    .dot.is-active{width:28px;background:linear-gradient(90deg, var(--brand), #88dc6f)}
    .viewport{overflow:hidden}
    .track{display:flex;gap:16px;transition:transform .42s cubic-bezier(.22,.61,.36,1);will-change:transform}
    .slide{
      min-width:100%;
      display:grid;
      grid-template-columns:minmax(0, 300px) minmax(0,1fr);
      gap:22px;
      padding:18px;
      border-radius:var(--radius-lg);
      border:1px solid var(--line);
      background:linear-gradient(180deg, rgba(255,255,255,.88), rgba(255,255,255,.74));
      backdrop-filter: blur(8px);
      box-shadow:0 12px 32px rgba(39,72,22,.08);
    }
    .slideMediaWrap{border-radius:22px;overflow:hidden;background:rgba(99,207,78,.08);border:1px solid rgba(40,78,24,.08);align-self:start}
    .slideMedia{display:block;width:100%;height:auto;aspect-ratio: 4 / 3;object-fit:cover}
    .slideCopy{min-width:0}
    .slideMeta{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
    .count{display:inline-flex;align-items:center;justify-content:center;min-width:42px;height:42px;padding:0 12px;border-radius:999px;background:rgba(99,207,78,.12);border:1px solid rgba(99,207,78,.16);font-size:13px;font-weight:900;color:#2f7d2a}
    .content--slide{font-size:15px}
    .footNote{padding:0 24px 24px;color:var(--muted);font-size:12px;line-height:1.6}
    .empty{position:relative;overflow:hidden;padding:34px 22px;border-radius:var(--radius-lg);border:1px dashed rgba(40,78,24,.18);background:rgba(255,255,255,.72);text-align:center}
    .emptyGlow{position:absolute;inset:auto auto -30px -30px;width:140px;height:140px;border-radius:999px;background:rgba(99,207,78,.12);filter:blur(20px)}
    .empty h2{position:relative;margin:0 0 10px;font-size:24px;line-height:1.08;letter-spacing:-.03em}
    .empty p{position:relative;margin:0;color:var(--muted);font-size:15px;line-height:1.7}
    .reveal{opacity:0;transform:translateY(16px);animation:revealUp .65s ease forwards}
    @keyframes revealUp{to{opacity:1;transform:translateY(0)}}
    @media (max-width: 900px){
      .newsItem,.slide{grid-template-columns:1fr}
      .mediaWrap{min-height:unset}
      .slideMeta{justify-content:flex-start}
    }
    @media (max-width: 640px){
      .shell{padding:12px}
      .hero{padding:20px 18px 10px}
      .section{padding:8px 12px 16px}
      .newsItem,.slide{padding:14px}
      .headline{font-size:26px}
      .content{font-size:15px}
    }
    @media (prefers-reduced-motion: reduce){
      .reveal,.newsItem,.track,.controlBtn,.dot{animation:none;transition:none}
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="frame" id="root">
      <header class="hero reveal">
        <div class="kicker"><span class="kickerDot"></span> Bloc actualités</div>
        <h1 class="title">${escapeHtml(title)}</h1>
        <p class="intro">Les contenus courts publiés depuis Booster remontent automatiquement ici. Les images sont affichées dès qu'une image est ajoutée dans l'actualité.</p>
      </header>

      <main class="section">
        ${articles.length === 0 ? empty : layout === "carousel" ? `
          <section class="carouselShell reveal" id="carousel-shell">
            <div class="controls">
              <div class="dots" aria-label="Navigation des actualités">${dots}</div>
              <div class="controlButtons">
                <button class="controlBtn" type="button" data-prev aria-label="Actualité précédente">‹</button>
                <button class="controlBtn" type="button" data-next aria-label="Actualité suivante">›</button>
              </div>
            </div>
            <div class="viewport">
              <div class="track" id="track">${carouselItems}</div>
            </div>
          </section>` : `<section class="stack">${listItems}</section>`}
      </main>

      ${articles.length > 0 ? `<div class="footNote">Affichage automatique des ${escapeHtml(countText)}.</div>` : ""}
    </div>
  </div>

  <script>
    (function(){
      var root = document.getElementById('root');
      function postHeight(){
        var height = Math.max(
          document.documentElement.scrollHeight || 0,
          document.body.scrollHeight || 0,
          root ? root.getBoundingClientRect().height + 24 : 0
        );
        try { window.parent.postMessage({ type: 'inrcy:embed-resize', height: Math.ceil(height) }, '*'); } catch {}
      }

      var resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(postHeight) : null;
      if (resizeObserver && root) resizeObserver.observe(root);
      window.addEventListener('load', postHeight);
      window.addEventListener('resize', postHeight);
      setTimeout(postHeight, 60);
      setTimeout(postHeight, 300);
      setTimeout(postHeight, 900);
      Array.prototype.forEach.call(document.images || [], function(img){
        if (!img.complete) img.addEventListener('load', postHeight, { once: true });
      });

      var shell = document.getElementById('carousel-shell');
      if (!shell) return;
      var track = document.getElementById('track');
      var slides = shell.querySelectorAll('[data-slide]');
      var prev = shell.querySelector('[data-prev]');
      var next = shell.querySelector('[data-next]');
      var dots = shell.querySelectorAll('[data-dot]');
      var index = 0;

      function update(){
        if (!track) return;
        track.style.transform = 'translateX(' + (-index * 100) + '%)';
        dots.forEach(function(dot, i){
          dot.classList.toggle('is-active', i === index);
        });
        if (prev) prev.disabled = index === 0;
        if (next) next.disabled = index === slides.length - 1;
        setTimeout(postHeight, 80);
      }

      if (prev) prev.addEventListener('click', function(){ if (index > 0) { index -= 1; update(); }});
      if (next) next.addEventListener('click', function(){ if (index < slides.length - 1) { index += 1; update(); }});
      dots.forEach(function(dot, i){ dot.addEventListener('click', function(){ index = i; update(); }); });
      update();
    })();
  </script>
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
    const limit = clampLimit(searchParams.get("limit"));
    const layout = (searchParams.get("layout") === "carousel" ? "carousel" : "list") as LayoutMode;
    const token = searchParams.get("token") || "";

    if (!domain) return htmlResponse(renderHtml({ title, domain: "site inconnu", articles: [], layout, limit }), 400);
    if (source !== "inrcy_site" && source !== "site_web") {
      return htmlResponse(renderHtml({ title, domain, articles: [], layout, limit }), 400);
    }
    if (!token) {
      return htmlResponse(renderHtml({ title, domain, articles: [], layout, limit }), 401);
    }

    const signingSecret = process.env.INRCY_WIDGETS_SIGNING_SECRET;
    if (!signingSecret) throw new Error("Missing INRCY_WIDGETS_SIGNING_SECRET");

    const tok = verifyWidgetToken(token, signingSecret);
    const tokDomain = normalizeDomain(tok.domain);
    const tokSource = String(tok.source || "").trim();

    if (tokDomain !== domain || tokSource !== source) {
      return htmlResponse(renderHtml({ title, domain, articles: [], layout, limit }), 403);
    }

    const refHost = getRefererHost(req);
    if (refHost && refHost !== tokDomain) {
      return htmlResponse(renderHtml({ title, domain, articles: [], layout, limit }), 403);
    }

    const articles = await fetchArticles(domain, source, limit);
    return htmlResponse(renderHtml({ title, domain, articles, layout, limit }), 200);
  } catch {
    return htmlResponse(renderHtml({ title: "Actualités", domain: "iNrCy", articles: [], layout: "list", limit: 5 }), 500);
  }
}
