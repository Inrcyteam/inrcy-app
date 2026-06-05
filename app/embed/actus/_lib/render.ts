import { renderBoosterSiteContentHtml } from "@/lib/boosterFormatting";

export type LayoutMode = "list" | "carousel";
export type FontMode = "site" | "inter" | "poppins" | "montserrat" | "lora";
export type ThemeMode = "white" | "dark" | "gray" | "nature" | "sand";

type ThemePalette = {
  bg: string;
  surface: string;
  surfaceSoft: string;
  line: string;
  lineStrong: string;
  text: string;
  muted: string;
  brand: string;
  brandDeep: string;
  mediaBg: string;
  shadow: string;
  shadowSoft: string;
  colorScheme: "light" | "dark";
};

function escapeHtml(input: unknown) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeAttr(input: unknown) {
  return escapeHtml(input);
}

function isSupabaseBoosterStorageUrl(input: string) {
  try {
    const url = new URL(input);
    return url.pathname.includes("/storage/v1/object/") && url.pathname.includes("/booster/");
  } catch {
    return false;
  }
}

function stableMediaSrc(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (!isSupabaseBoosterStorageUrl(raw)) return raw;
  return `/embed/actus/media?src=${encodeURIComponent(raw)}`;
}

function stableImageSrc(input: string) {
  return stableMediaSrc(input);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return readRecord(value);
  if (typeof value === "string") {
    try {
      return readRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return {};
}

function getVideoAttachment(article: Record<string, unknown>) {
  const metadata = parseJsonRecord(article.media_metadata);
  const metadataVideo = readRecord(metadata.video);
  const rawUrl = String(
    article.video_url ||
    article.videoUrl ||
    metadataVideo.publicUrl ||
    metadataVideo.public_url ||
    metadataVideo.url ||
    "",
  ).trim();
  if (!rawUrl) return null;
  return {
    url: rawUrl,
    mime: String(article.video_mime || metadataVideo.type || "video/mp4").trim() || "video/mp4",
    poster: String(article.video_thumbnail_url || metadataVideo.thumbnailUrl || metadataVideo.thumbnail_url || "").trim(),
  };
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
        .map((x) => x.replace(/^\"+|\"+$/g, "").trim())
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

function shouldCollapseContent(input: unknown) {
  const raw = String(input ?? "").trim();
  if (!raw) return false;
  const paragraphs = raw.split(/\n{2,}/).filter((x) => x.trim()).length;
  return raw.length > 320 || paragraphs > 3 || raw.split(/\n/).length > 6;
}

function renderArticleBody(article: Record<string, unknown>, idPrefix: string) {
  const raw = String(article.content ?? "").trim();
  const content = renderBoosterSiteContentHtml(raw);
  if (!content) return "";
  const collapsible = shouldCollapseContent(raw);
  const contentId = `${idPrefix}-content`;
  return `
    <div class="newsBody ${collapsible ? "is-collapsible" : ""}" ${collapsible ? `data-collapsible data-open="false"` : ""}>
      <div id="${safeAttr(contentId)}" class="newsContent ${collapsible ? "is-collapsed" : ""}">${content}</div>
      ${collapsible ? `<button class="newsMore" type="button" data-toggle aria-expanded="false" aria-controls="${safeAttr(contentId)}">Voir plus</button>` : ""}
    </div>
  `;
}

function renderMediaBlock(article: Record<string, unknown>, idPrefix: string) {
  const video = getVideoAttachment(article);
  if (video) {
    const src = stableMediaSrc(video.url);
    const poster = video.poster ? stableMediaSrc(video.poster) : "";
    return `
      <div class="mediaCol mediaColVideo">
        <video class="media mediaVideo" src="${safeAttr(src)}" ${poster ? `poster="${safeAttr(poster)}"` : ""} controls playsinline preload="metadata" controlslist="nodownload" data-original-src="${safeAttr(video.url)}">
          <source src="${safeAttr(src)}" type="${safeAttr(video.mime)}" />
        </video>
        <div class="mediaFallback" aria-hidden="true">Vidéo indisponible</div>
      </div>`;
  }

  const images = parseArrayLike(article.images).filter(Boolean).slice(0, 8);
  if (!images.length) return "";
  if (images.length === 1) {
    return `
      <div class="mediaCol">
        <img class="media" src="${safeAttr(stableImageSrc(images[0]))}" data-original-src="${safeAttr(images[0])}" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer" />
        <div class="mediaFallback" aria-hidden="true">Image indisponible</div>
      </div>`;
  }
  const slides = images.map((img) => `
    <div class="mediaSlide" data-media-slide>
      <img class="media" src="${safeAttr(stableImageSrc(img))}" data-original-src="${safeAttr(img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
    </div>
  `).join("");
  const dots = images.map((_, imageIndex) => `<button class="mediaDot" type="button" data-media-dot="${imageIndex}" aria-label="Photo ${imageIndex + 1}"></button>`).join("");
  return `
    <div class="mediaCol">
      <div class="mediaCarousel" data-media-carousel data-media-id="${safeAttr(idPrefix)}">
        <div class="mediaViewport">
          <div class="mediaTrack" data-media-track>${slides}</div>
        </div>
        <div class="mediaFallback" aria-hidden="true">Image indisponible</div>
        <div class="mediaNavWrap">
          <button class="mediaNavBtn" type="button" data-media-prev aria-label="Photo précédente">‹</button>
          <div class="mediaDots" aria-label="Navigation des photos">${dots}</div>
          <button class="mediaNavBtn" type="button" data-media-next aria-label="Photo suivante">›</button>
        </div>
      </div>
    </div>`;
}

function fontStack(mode: FontMode) {
  switch (mode) {
    case "inter":
      return "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    case "poppins":
      return "Poppins, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    case "montserrat":
      return "Montserrat, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    case "lora":
      return "Lora, Georgia, Cambria, 'Times New Roman', serif";
    default:
      return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
  }
}

function getThemePalette(mode: ThemeMode): ThemePalette {
  switch (mode) {
    case "dark":
      return {
        bg: "#111714",
        surface: "#161d18",
        surfaceSoft: "#1a231d",
        line: "rgba(227,239,228,.10)",
        lineStrong: "rgba(227,239,228,.16)",
        text: "#f5f8f4",
        muted: "#b4c1b5",
        brand: "#7ce773",
        brandDeep: "#baf7b4",
        mediaBg: "#1d2a21",
        shadow: "0 18px 42px rgba(0,0,0,.28)",
        shadowSoft: "0 10px 24px rgba(0,0,0,.18)",
        colorScheme: "dark",
      };
    case "gray":
      return {
        bg: "#f4f5f6",
        surface: "#ffffff",
        surfaceSoft: "#fafafa",
        line: "rgba(17,24,39,.08)",
        lineStrong: "rgba(17,24,39,.14)",
        text: "#111827",
        muted: "#4b5563",
        brand: "#62d56a",
        brandDeep: "#1f6a32",
        mediaBg: "#eef1ef",
        shadow: "0 18px 42px rgba(17,24,39,.08)",
        shadowSoft: "0 10px 24px rgba(17,24,39,.05)",
        colorScheme: "light",
      };
    case "sand":
      return {
        bg: "#f8f2e8",
        surface: "#fffdf8",
        surfaceSoft: "#fffaf2",
        line: "rgba(84,52,20,.10)",
        lineStrong: "rgba(84,52,20,.16)",
        text: "#2c1f14",
        muted: "#6d5a49",
        brand: "#d8ab63",
        brandDeep: "#8b5e22",
        mediaBg: "#f2e4cf",
        shadow: "0 18px 42px rgba(84,52,20,.10)",
        shadowSoft: "0 10px 24px rgba(84,52,20,.06)",
        colorScheme: "light",
      };
    case "white":
      return {
        bg: "#ffffff",
        surface: "#ffffff",
        surfaceSoft: "#ffffff",
        line: "rgba(17,24,39,.08)",
        lineStrong: "rgba(17,24,39,.14)",
        text: "#0f172a",
        muted: "#475569",
        brand: "#67d66d",
        brandDeep: "#1f6a32",
        mediaBg: "#eef6ee",
        shadow: "0 18px 42px rgba(15,23,42,.06)",
        shadowSoft: "0 10px 24px rgba(15,23,42,.045)",
        colorScheme: "light",
      };
    case "nature":
    default:
      return {
        bg: "#f3f8ee",
        surface: "#ffffff",
        surfaceSoft: "#fbfdf9",
        line: "rgba(18,35,19,.09)",
        lineStrong: "rgba(18,35,19,.14)",
        text: "#102112",
        muted: "#506251",
        brand: "#6bd05f",
        brandDeep: "#214f24",
        mediaBg: "#edf6e6",
        shadow: "0 18px 42px rgba(16,28,18,.08)",
        shadowSoft: "0 10px 24px rgba(16,28,18,.05)",
        colorScheme: "light",
      };
  }
}

function renderListItems(articles: Array<Record<string, unknown>>) {
  return articles
    .map((article, index) => {
      const images = parseArrayLike(article.images);
      const hasMedia = images.length > 0 || !!getVideoAttachment(article);
      const media = renderMediaBlock(article, `actu-${index}-media`);
      const date = formatDate(article.created_at);
      const articleTitle = String(article.title ?? "Actualité").trim() || "Actualité";
      const body = renderArticleBody(article, `actu-${index}`);
      return `
        <article class="newsCard reveal ${hasMedia ? "hasMedia" : "noMedia"}" style="animation-delay:${Math.min(index * 80, 320)}ms">
          ${media}
          <div class="copyCol">
            ${date ? `<div class="newsDate">${escapeHtml(date)}</div>` : ""}
            <h2 class="newsTitle">${escapeHtml(articleTitle)}</h2>
            ${body}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderCarouselItems(articles: Array<Record<string, unknown>>) {
  return articles
    .map((article, index) => {
      const images = parseArrayLike(article.images);
      const hasMedia = images.length > 0 || !!getVideoAttachment(article);
      const media = renderMediaBlock(article, `carousel-${index}-media`);
      const date = formatDate(article.created_at);
      const articleTitle = String(article.title ?? "Actualité").trim() || "Actualité";
      const body = renderArticleBody(article, `carousel-${index}`);
      return `
        <article class="slide reveal ${hasMedia ? "hasMedia" : "noMedia"}" data-slide style="animation-delay:${Math.min(index * 80, 320)}ms">
          ${media}
          <div class="copyCol">
            ${date ? `<div class="newsDate">${escapeHtml(date)}</div>` : ""}
            <h2 class="newsTitle">${escapeHtml(articleTitle)}</h2>
            ${body}
          </div>
        </article>
      `;
    })
    .join("");
}

export function renderEmbedHtml(params: {
  title: string;
  articles: Array<Record<string, unknown>>;
  layout: LayoutMode;
  font: FontMode;
  theme: ThemeMode;
  frameId?: string;
}) {
  const { title, articles, layout, font, theme, frameId = "inrcy-embed" } = params;
  const fontFamily = fontStack(font);
  const palette = getThemePalette(theme);
  const listItems = renderListItems(articles);
  const carouselItems = renderCarouselItems(articles);
  const dots = articles.map((_, i) => `<button class="dot" type="button" aria-label="Actualité ${i + 1}" data-dot="${i}"></button>`).join("");
  const counter = articles.length > 0 ? `<div class="counter" aria-live="polite"><span data-current>1</span>/<span data-total>${articles.length}</span></div>` : "";
  const empty = `<section class="empty reveal"><h2>Aucune actualité pour le moment</h2><p>Les prochaines publications apparaîtront ici automatiquement.</p></section>`;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Lora:wght@400;500;600;700&family=Montserrat:wght@500;600;700;800&family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{color-scheme:${palette.colorScheme};--font:${fontFamily};--bg:${palette.bg};--surface:${palette.surface};--surface-soft:${palette.surfaceSoft};--line:${palette.line};--line-strong:${palette.lineStrong};--text:${palette.text};--muted:${palette.muted};--brand:${palette.brand};--brand-deep:${palette.brandDeep};--media-bg:${palette.mediaBg};--radius-xl:28px;--radius-lg:24px;--shadow:${palette.shadow};--shadow-soft:${palette.shadowSoft}}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:transparent;color:var(--text);font-family:var(--font);overflow:hidden}body{width:100%}img{display:block;max-width:100%}.shell{width:100%;padding:0}.frame{width:100%;display:grid;gap:18px;background:var(--bg);border:1px solid var(--line);border-radius:var(--radius-xl);box-shadow:var(--shadow);padding:28px}.header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}.title{margin:0;font-size:clamp(28px,3vw,40px);line-height:1.02;letter-spacing:-.045em;font-weight:800}.stack,.carouselWrap{display:grid;gap:18px}.newsCard,.slide{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow-soft);overflow:clip}.newsCard.hasMedia,.slide.hasMedia{display:grid;grid-template-columns:minmax(360px,46%) minmax(0,1fr);align-items:start}.newsCard.noMedia,.slide.noMedia{display:block}.mediaCol{position:relative;display:flex;align-items:center;justify-content:center;align-self:start;width:100%;aspect-ratio:4/3;min-height:340px;height:auto;overflow:hidden;isolation:isolate;padding:12px;background:linear-gradient(145deg,color-mix(in srgb, var(--media-bg) 72%, white),color-mix(in srgb, var(--surface-soft) 84%, var(--media-bg) 16%))}.mediaCol::before{content:"";position:absolute;inset:12px;border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.58),rgba(255,255,255,.18));border:1px solid rgba(255,255,255,.55);box-shadow:inset 0 1px 0 rgba(255,255,255,.45)}.mediaCol::after{content:"";position:absolute;inset:auto auto -34px -28px;width:140px;height:140px;border-radius:999px;background:radial-gradient(circle,rgba(255,255,255,.42),rgba(255,255,255,0) 72%);pointer-events:none}.media{position:relative;z-index:1;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;object-position:center;border-radius:20px;box-shadow:0 18px 34px rgba(15,23,42,.16)}.mediaColVideo{background:#050816}.mediaVideo{object-fit:contain;background:#050816}.media.is-fallback-img{object-fit:contain;box-shadow:none;background:var(--surface-soft);padding:34px}.mediaFallback{position:absolute;z-index:2;inset:12px;border-radius:20px;display:none;align-items:center;justify-content:center;text-align:center;padding:20px;color:var(--muted);font-weight:800;background:linear-gradient(180deg,rgba(255,255,255,.70),rgba(255,255,255,.30));border:1px dashed var(--line-strong)}.mediaCol.has-fallback-image .mediaFallback{display:none}.mediaCol.is-media-error .mediaFallback{display:flex}.mediaCarousel{position:relative;z-index:1;width:100%;height:100%;min-height:0}.mediaViewport{overflow:hidden;height:100%;border-radius:20px}.mediaTrack{display:flex;width:100%;height:100%;transition:transform .35s cubic-bezier(.22,.61,.36,1);will-change:transform}.mediaSlide{position:relative;min-width:100%;height:100%;display:flex}.mediaNavWrap{position:absolute;left:12px;right:12px;bottom:12px;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:10px}.mediaNavBtn{width:36px;height:36px;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:rgba(10,16,30,.58);backdrop-filter:blur(8px);color:#fff;font-size:22px;line-height:1;cursor:pointer}.mediaDots{display:flex;align-items:center;justify-content:center;gap:6px;flex:1}.mediaDot{width:8px;height:8px;border:0;border-radius:999px;background:rgba(255,255,255,.42);padding:0;cursor:pointer}.mediaDot.is-active{width:22px;background:#fff}.copyCol{padding:24px 26px;min-width:0;display:grid;align-content:start}.newsDate{margin:0 0 10px;font-size:12px;line-height:1;color:var(--brand-deep);font-weight:800;letter-spacing:.09em;text-transform:uppercase}.newsTitle{margin:0 0 14px;font-size:clamp(28px,2.6vw,42px);line-height:1.08;letter-spacing:-.045em;font-weight:800;text-wrap:balance}.newsBody{display:grid;gap:14px}.newsContent{display:grid;gap:12px;color:var(--muted);font-size:18px;line-height:1.75}.newsContent p{margin:0}.newsContent.is-collapsed{position:relative;overflow:hidden;max-height:14.5em}.newsContent.is-collapsed::after{content:"";position:absolute;left:0;right:0;bottom:0;height:76px;background:linear-gradient(180deg,rgba(255,255,255,0),var(--surface) 78%)}.newsMore{justify-self:start;border:1px solid var(--line-strong);background:var(--surface);color:var(--text);font:inherit;font-size:14px;font-weight:800;border-radius:999px;padding:10px 14px;cursor:pointer;box-shadow:var(--shadow-soft);transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease}.newsMore:hover{transform:translateY(-1px);border-color:var(--brand)}.carouselWrap{align-items:start}.carouselHead{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}.carouselControls{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.counter{display:inline-flex;align-items:center;justify-content:center;min-width:62px;padding:8px 12px;border-radius:999px;border:1px solid var(--line-strong);background:var(--surface);font-size:13px;font-weight:800;color:var(--text)}.nav{display:flex;gap:10px}.navBtn{width:44px;height:44px;border-radius:999px;border:1px solid var(--line-strong);background:var(--surface);color:var(--text);cursor:pointer;font-size:20px;font-weight:800;transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease}.navBtn:hover{transform:translateY(-1px);box-shadow:var(--shadow-soft);border-color:var(--line-strong)}.navBtn:disabled{opacity:.35;cursor:not-allowed;transform:none;box-shadow:none}.dots{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dot{width:10px;height:10px;border:0;border-radius:999px;background:rgba(0,0,0,.12);padding:0;cursor:pointer;transition:all .2s ease}.dot.is-active{width:30px;background:linear-gradient(90deg,var(--brand),color-mix(in srgb, var(--brand) 60%, white))}.viewport{overflow:hidden;width:100%}.track{display:flex;gap:0;will-change:transform;transition:transform .45s cubic-bezier(.22,.61,.36,1);align-items:flex-start}.slide{min-width:100%;flex:0 0 100%;max-width:100%}.empty{padding:34px 22px;border-radius:var(--radius-lg);border:1px dashed var(--line-strong);background:var(--surface-soft);text-align:center}.empty h2{margin:0 0 10px;font-size:24px;line-height:1.1;letter-spacing:-.03em}.empty p{margin:0;color:var(--muted);font-size:15px;line-height:1.7}.reveal{opacity:0;transform:translateY(12px);animation:fadeUp .55s ease forwards}@keyframes fadeUp{to{opacity:1;transform:translateY(0)}}@media (max-width:940px){.frame{padding:22px 18px;border-radius:24px}.newsCard.hasMedia,.slide.hasMedia{grid-template-columns:1fr}.mediaCol{aspect-ratio:16/10;min-height:280px}.copyCol{padding:20px 18px}}@media (max-width:640px){.frame{padding:18px 14px;border-radius:20px}.title{font-size:clamp(24px,8vw,32px)}.newsTitle{font-size:clamp(22px,7vw,30px)}.newsContent{font-size:16px;line-height:1.68}.newsContent.is-collapsed{max-height:12.2em}.mediaCol{aspect-ratio:1/1;min-height:230px;padding:10px}.carouselHead{justify-content:flex-end}.carouselControls{width:100%;justify-content:space-between}}@media (prefers-reduced-motion:reduce){.reveal,.track,.dot,.navBtn,.newsMore{animation:none;transition:none}}
</style>
</head>
<body>
<div class="shell"><section class="frame" id="root"><header class="header reveal"><h1 class="title">${escapeHtml(title)}</h1></header>${articles.length === 0 ? empty : layout === "carousel" ? `<section class="carouselWrap" id="carouselRoot"><div class="carouselHead reveal"><div class="dots" aria-label="Navigation des actualités">${dots}</div><div class="carouselControls">${counter}<div class="nav"><button class="navBtn" type="button" data-prev aria-label="Actualité précédente">‹</button><button class="navBtn" type="button" data-next aria-label="Actualité suivante">›</button></div></div></div><div class="viewport"><div class="track" id="track">${carouselItems}</div></div></section>` : `<section class="stack">${listItems}</section>`}</section></div>
<script>
(function(){
var EMBED_ID=${JSON.stringify(frameId)};var root=document.getElementById('root');var parentOrigin='*';var sentHeight=0;var resizeTimer=null;var settleTicks=0;
function computeHeight(){var body=document.body;var doc=document.documentElement;var values=[root?root.scrollHeight:0,root?root.offsetHeight:0,root?Math.ceil(root.getBoundingClientRect().height):0,body?body.scrollHeight:0,body?body.offsetHeight:0,doc?doc.scrollHeight:0,doc?doc.offsetHeight:0,doc?Math.ceil(doc.getBoundingClientRect().height):0];return Math.max.apply(Math,values.concat([140]));}
function post(type,height){try{window.parent.postMessage({source:'inrcy-embed',type:type,frameId:EMBED_ID,height:height||computeHeight()},parentOrigin);}catch(e){}}
function postHeight(force){var next=computeHeight();if(!force&&Math.abs(next-sentHeight)<2)return;sentHeight=next;post('inrcy:embed-resize',next);}
function schedule(force){if(resizeTimer)window.clearTimeout(resizeTimer);resizeTimer=window.setTimeout(function(){requestAnimationFrame(function(){postHeight(force);});},16);}
function settle(){settleTicks=0;var interval=window.setInterval(function(){settleTicks+=1;postHeight(true);if(settleTicks>=18)window.clearInterval(interval);},220);}function ready(){post('inrcy:embed-ready',computeHeight());}
window.addEventListener('message',function(event){var data=event.data||{};if(!data||data.source!=='inrcy-host')return;if(data.frameId!==EMBED_ID)return;parentOrigin=event.origin||'*';if(data.type==='inrcy:embed-init'||data.type==='inrcy:embed-ping'){ready();schedule(true);settle();}});
if(root&&typeof ResizeObserver!=='undefined'){var ro=new ResizeObserver(function(){schedule(false);});ro.observe(root);ro.observe(document.body);ro.observe(document.documentElement);}if(root&&typeof MutationObserver!=='undefined'){var mo=new MutationObserver(function(){schedule(true);});mo.observe(root,{childList:true,subtree:true,characterData:true,attributes:true});}
document.addEventListener('DOMContentLoaded',function(){ready();schedule(true);settle();});window.addEventListener('load',function(){ready();schedule(true);settle();});window.addEventListener('resize',function(){schedule(true);});if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){schedule(true);settle();}).catch(function(){});}var FALLBACK_IMAGE='data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221200%22%20height%3D%22900%22%20viewBox%3D%220%200%201200%20900%22%3E%3Crect%20width%3D%221200%22%20height%3D%22900%22%20rx%3D%2248%22%20fill%3D%22%23f8fafc%22%2F%3E%3Cpath%20d%3D%22M394%20530l124-126%2090%2092%2058-60%20140%20144H394z%22%20fill%3D%22%23dbe5ee%22%2F%3E%3Ccircle%20cx%3D%22474%22%20cy%3D%22334%22%20r%3D%2248%22%20fill%3D%22%23cbd5e1%22%2F%3E%3Ctext%20x%3D%22600%22%20y%3D%22658%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2242%22%20font-weight%3D%22700%22%20fill%3D%22%2364758b%22%3EImage%20indisponible%3C%2Ftext%3E%3C%2Fsvg%3E';
function markImageFailed(img){if(!img||img.getAttribute('data-fallback-applied')==='true')return;img.setAttribute('data-fallback-applied','true');img.classList.add('is-fallback-img');img.removeAttribute('srcset');img.src=FALLBACK_IMAGE;var col=img.closest?img.closest('.mediaCol'):null;if(col)col.classList.add('has-fallback-image');schedule(true);settle();}
Array.prototype.forEach.call(document.images||[],function(img){if(img.classList&&img.classList.contains('media')){img.addEventListener('error',function(){markImageFailed(img);});if(img.complete&&img.naturalWidth===0)markImageFailed(img);}if(!img.complete)img.addEventListener('load',function(){schedule(true);settle();},{once:true});});Array.prototype.forEach.call(document.querySelectorAll('video.mediaVideo'),function(video){video.addEventListener('loadedmetadata',function(){schedule(true);settle();});video.addEventListener('loadeddata',function(){schedule(true);settle();});video.addEventListener('error',function(){var col=video.closest?video.closest('.mediaCol'):null;if(col)col.classList.add('is-media-error');schedule(true);settle();});});setTimeout(function(){ready();schedule(true);},30);setTimeout(function(){schedule(true);},180);setTimeout(function(){schedule(true);},500);setTimeout(function(){schedule(true);},1000);setTimeout(function(){schedule(true);},1800);setTimeout(function(){schedule(true);},3200);
Array.prototype.forEach.call(document.querySelectorAll('[data-collapsible]'),function(block){var btn=block.querySelector('[data-toggle]');var content=block.querySelector('.newsContent');if(!btn||!content)return;btn.addEventListener('click',function(){var expanded=block.getAttribute('data-open')==='true';var next=!expanded;block.setAttribute('data-open',next?'true':'false');content.classList.toggle('is-collapsed',!next);btn.setAttribute('aria-expanded',next?'true':'false');btn.textContent=next?'Voir moins':'Voir plus';schedule(true);settle();});});
Array.prototype.forEach.call(document.querySelectorAll('[data-media-carousel]'),function(carousel){var track=carousel.querySelector('[data-media-track]');var slides=carousel.querySelectorAll('[data-media-slide]');var prev=carousel.querySelector('[data-media-prev]');var next=carousel.querySelector('[data-media-next]');var dots=carousel.querySelectorAll('[data-media-dot]');var index=0;var timer=null;var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;function preload(nextIndex){if(!slides.length)return;var slide=slides[(nextIndex+slides.length)%slides.length];var img=slide?slide.querySelector('img.media'):null;var src=img?img.getAttribute('src'):'';if(src){var pre=new Image();pre.src=src;}}function show(nextIndex){if(!track||!slides.length)return;index=(nextIndex+slides.length)%slides.length;track.style.transform='translateX('+(-index*100)+'%)';Array.prototype.forEach.call(dots,function(dot,i){dot.classList.toggle('is-active',i===index);});preload(index+1);schedule(true);}function start(){if(reduce||slides.length<2||timer)return;timer=window.setInterval(function(){show(index+1);},4500);}function stop(){if(timer){window.clearInterval(timer);timer=null;}}if(slides.length<2)return;if(prev)prev.addEventListener('click',function(){stop();show(index-1);start();});if(next)next.addEventListener('click',function(){stop();show(index+1);start();});Array.prototype.forEach.call(dots,function(dot,i){dot.addEventListener('click',function(){stop();show(i);start();});});carousel.addEventListener('mouseenter',stop);carousel.addEventListener('mouseleave',start);carousel.addEventListener('focusin',stop);carousel.addEventListener('focusout',start);show(0);preload(1);start();});
var shell=document.getElementById('carouselRoot');if(!shell)return;var track=document.getElementById('track');var slides=shell.querySelectorAll('[data-slide]');var prev=shell.querySelector('[data-prev]');var next=shell.querySelector('[data-next]');var dots=shell.querySelectorAll('[data-dot]');var current=shell.querySelector('[data-current]');var index=0;function update(){if(!track)return;track.style.transform='translateX('+(-index*100)+'%)';dots.forEach(function(dot,i){dot.classList.toggle('is-active',i===index);});if(current)current.textContent=String(index+1);if(prev)prev.disabled=index===0;if(next)next.disabled=index===slides.length-1;schedule(true);}if(prev)prev.addEventListener('click',function(){if(index>0){index-=1;update();}});if(next)next.addEventListener('click',function(){if(index<slides.length-1){index+=1;update();}});dots.forEach(function(dot,i){dot.addEventListener('click',function(){index=i;update();});});update();
})();
</script>
</body></html>`;
}
