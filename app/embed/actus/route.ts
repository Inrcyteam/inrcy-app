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
  const { title, articles, layout } = params;

  const listItems = articles
    .map((article, index) => {
      const img = parseArrayLike(article.images)[0] || "";
      const date = formatDate(article.created_at);
      const articleTitle = String(article.title ?? "Actualité").trim() || "Actualité";
      const content = renderRichText(article.content);
      return `
        <article class="newsCard reveal ${img ? "hasMedia" : "noMedia"}" style="animation-delay:${Math.min(index * 70, 350)}ms">
          ${img ? `<div class="newsMediaWrap"><img class="newsMedia" src="${safeAttr(img)}" alt="" loading="lazy" /></div>` : ""}
          <div class="newsBody">
            ${date ? `<div class="newsDate">${escapeHtml(date)}</div>` : ""}
            <h2 class="newsTitle">${escapeHtml(articleTitle)}</h2>
            ${content ? `<div class="newsContent">${content}</div>` : ""}
          </div>
        </article>
      `;
    })
    .join("");

  const carouselItems = articles
    .map((article, index) => {
      const img = parseArrayLike(article.images)[0] || "";
      const date = formatDate(article.created_at);
      const articleTitle = String(article.title ?? "Actualité").trim() || "Actualité";
      const content = renderRichText(article.content);
      return `
        <article class="slide ${img ? "hasMedia" : "noMedia"}" data-slide>
          ${img ? `<div class="slideMediaWrap"><img class="slideMedia" src="${safeAttr(img)}" alt="" loading="lazy" /></div>` : ""}
          <div class="slideBody">
            ${date ? `<div class="newsDate">${escapeHtml(date)}</div>` : ""}
            <h2 class="newsTitle newsTitle--slide">${escapeHtml(articleTitle)}</h2>
            ${content ? `<div class="newsContent newsContent--slide">${content}</div>` : ""}
          </div>
        </article>
      `;
    })
    .join("");

  const dots = articles
    .map((_, i) => `<button class="dot" type="button" aria-label="Actualité ${i + 1}" data-dot="${i}"></button>`)
    .join("");

  const empty = `
    <section class="empty reveal">
      <h2>Aucune actualité pour le moment</h2>
      <p>Les prochaines publications apparaîtront ici automatiquement.</p>
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
      --bg:#f7fbf4;
      --surface:#ffffff;
      --surface-soft:#fbfdf9;
      --line:rgba(30,70,21,.10);
      --line-strong:rgba(30,70,21,.16);
      --text:#142114;
      --muted:rgba(20,33,20,.68);
      --brand:#5bc54b;
      --brand-deep:#2c7a28;
      --shadow:0 22px 56px rgba(44,75,27,.08);
      --shadow-soft:0 10px 26px rgba(44,75,27,.06);
      --radius-xl:28px;
      --radius-lg:22px;
      --radius-md:18px;
    }
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:transparent;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--text);overflow:hidden}
    img{max-width:100%;display:block}
    body{width:100%}
    .shell{width:100%;padding:14px}
    .frame{
      width:100%;
      border-radius:var(--radius-xl);
      border:1px solid var(--line);
      background:linear-gradient(180deg, rgba(247,251,244,.96), rgba(244,249,239,.96));
      box-shadow:var(--shadow);
      overflow:hidden;
    }
    .header{padding:28px 30px 10px}
    .title{margin:0;font-size:clamp(30px,4vw,42px);line-height:1;letter-spacing:-.045em;font-weight:900}
    .section{padding:6px 18px 22px}
    .stack{display:grid;gap:18px}
    .newsCard,.slide{
      width:100%;
      border:1px solid var(--line);
      border-radius:var(--radius-lg);
      background:linear-gradient(180deg, rgba(255,255,255,.96), rgba(255,255,255,.88));
      box-shadow:var(--shadow-soft);
      overflow:hidden;
    }
    .newsCard.hasMedia,.slide.hasMedia{display:grid;grid-template-columns:minmax(220px, 34%) minmax(0,1fr)}
    .newsCard.noMedia,.slide.noMedia{display:block}
    .newsMediaWrap,.slideMediaWrap{height:100%;min-height:240px;background:#eef5e7}
    .newsMedia,.slideMedia{width:100%;height:100%;object-fit:cover}
    .newsBody,.slideBody{padding:24px 26px}
    .newsDate{margin:0 0 12px;font-size:12px;line-height:1;color:var(--brand-deep);font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    .newsTitle{margin:0 0 14px;font-size:clamp(28px,3.6vw,40px);line-height:1.08;letter-spacing:-.045em;font-weight:900;text-wrap:balance}
    .newsTitle--slide{font-size:clamp(26px,3.3vw,38px)}
    .newsContent{display:grid;gap:14px;color:var(--muted);font-size:18px;line-height:1.75}
    .newsContent p{margin:0}
    .newsContent--slide{font-size:17px}
    .carousel{display:grid;gap:16px}
    .carouselTop{display:flex;justify-content:flex-end;align-items:center;gap:14px;flex-wrap:wrap;padding:0 4px}
    .dots{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .dot{width:9px;height:9px;border-radius:999px;border:0;background:rgba(44,122,40,.16);padding:0;cursor:pointer;transition:all .22s ease}
    .dot.is-active{width:28px;background:linear-gradient(90deg,var(--brand),#8ddc7f)}
    .nav{display:flex;gap:10px}
    .navBtn{width:46px;height:46px;border-radius:999px;border:1px solid var(--line);background:#fff;cursor:pointer;font-size:20px;font-weight:900;color:var(--text);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}
    .navBtn:hover{transform:translateY(-1px);border-color:var(--line-strong);box-shadow:var(--shadow-soft)}
    .navBtn:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
    .viewport{overflow:hidden}
    .track{display:flex;gap:16px;transition:transform .45s cubic-bezier(.22,.61,.36,1);will-change:transform}
    .slide{min-width:100%}
    .empty{padding:34px 22px;border-radius:var(--radius-lg);border:1px dashed var(--line-strong);background:rgba(255,255,255,.75);text-align:center}
    .empty h2{margin:0 0 10px;font-size:24px;line-height:1.1;letter-spacing:-.03em}
    .empty p{margin:0;color:var(--muted);font-size:15px;line-height:1.7}
    .reveal{opacity:0;transform:translateY(14px);animation:fadeUp .6s ease forwards}
    @keyframes fadeUp{to{opacity:1;transform:translateY(0)}}
    @media (max-width: 960px){
      .newsCard.hasMedia,.slide.hasMedia{grid-template-columns:1fr}
      .newsMediaWrap,.slideMediaWrap{min-height:220px}
    }
    @media (max-width: 640px){
      .shell{padding:10px}
      .header{padding:22px 18px 8px}
      .section{padding:6px 10px 14px}
      .newsBody,.slideBody{padding:18px 18px 20px}
      .newsTitle,.newsTitle--slide{font-size:clamp(24px,8vw,32px)}
      .newsContent,.newsContent--slide{font-size:16px;line-height:1.68}
    }
    @media (prefers-reduced-motion: reduce){
      .reveal,.track,.dot,.navBtn{animation:none;transition:none}
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="frame" id="root">
      <header class="header reveal">
        <h1 class="title">${escapeHtml(title)}</h1>
      </header>
      <main class="section">
        ${articles.length === 0 ? empty : layout === "carousel" ? `
          <section class="carousel reveal" id="carousel-shell">
            <div class="carouselTop">
              <div class="dots" aria-label="Navigation des actualités">${dots}</div>
              <div class="nav">
                <button class="navBtn" type="button" data-prev aria-label="Actualité précédente">‹</button>
                <button class="navBtn" type="button" data-next aria-label="Actualité suivante">›</button>
              </div>
            </div>
            <div class="viewport"><div class="track" id="track">${carouselItems}</div></div>
          </section>
        ` : `<section class="stack">${listItems}</section>`}
      </main>
    </section>
  </div>
  <script>
    (function(){
      var root = document.getElementById('root');
      function heightValue(){
        var heights = [
          document.documentElement ? document.documentElement.scrollHeight : 0,
          document.documentElement ? document.documentElement.offsetHeight : 0,
          document.body ? document.body.scrollHeight : 0,
          document.body ? document.body.offsetHeight : 0,
          root ? root.scrollHeight + 28 : 0,
          root ? Math.ceil(root.getBoundingClientRect().height) + 28 : 0
        ];
        return Math.max.apply(Math, heights.concat([320]));
      }
      function postHeight(){
        try { window.parent.postMessage({ type:'inrcy:embed-resize', height: Math.ceil(heightValue()) }, '*'); } catch {}
      }
      if (typeof ResizeObserver !== 'undefined' && root) {
        var ro = new ResizeObserver(postHeight);
        ro.observe(root);
      }
      if (typeof MutationObserver !== 'undefined' && root) {
        var mo = new MutationObserver(function(){ requestAnimationFrame(postHeight); });
        mo.observe(root, { childList:true, subtree:true, characterData:true, attributes:true });
      }
      window.addEventListener('DOMContentLoaded', postHeight);
      window.addEventListener('load', postHeight);
      window.addEventListener('resize', postHeight);
      setTimeout(postHeight, 30);
      setTimeout(postHeight, 160);
      setTimeout(postHeight, 400);
      setTimeout(postHeight, 1000);
      Array.prototype.forEach.call(document.images || [], function(img){ if (!img.complete) img.addEventListener('load', postHeight, { once:true }); });

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
        dots.forEach(function(dot, i){ dot.classList.toggle('is-active', i === index); });
        if (prev) prev.disabled = index === 0;
        if (next) next.disabled = index === slides.length - 1;
        setTimeout(postHeight, 60);
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
