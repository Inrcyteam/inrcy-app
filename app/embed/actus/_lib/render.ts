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
      const img = parseArrayLike(article.images)[0] || "";
      const date = formatDate(article.created_at);
      const articleTitle = String(article.title ?? "Actualité").trim() || "Actualité";
      const content = renderRichText(article.content);
      return `
        <article class="newsCard reveal ${img ? "hasMedia" : "noMedia"}" style="animation-delay:${Math.min(index * 80, 320)}ms">
          ${img ? `
            <div class="mediaCol">
              <img class="media" src="${safeAttr(img)}" alt="" loading="lazy" />
            </div>` : ""}
          <div class="copyCol">
            ${date ? `<div class="newsDate">${escapeHtml(date)}</div>` : ""}
            <h2 class="newsTitle">${escapeHtml(articleTitle)}</h2>
            ${content ? `<div class="newsContent">${content}</div>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderCarouselItems(articles: Array<Record<string, unknown>>) {
  return articles
    .map((article, index) => {
      const img = parseArrayLike(article.images)[0] || "";
      const date = formatDate(article.created_at);
      const articleTitle = String(article.title ?? "Actualité").trim() || "Actualité";
      const content = renderRichText(article.content);
      return `
        <article class="slide reveal ${img ? "hasMedia" : "noMedia"}" data-slide style="animation-delay:${Math.min(index * 80, 320)}ms">
          ${img ? `
            <div class="mediaCol">
              <img class="media" src="${safeAttr(img)}" alt="" loading="lazy" />
            </div>` : ""}
          <div class="copyCol">
            ${date ? `<div class="newsDate">${escapeHtml(date)}</div>` : ""}
            <h2 class="newsTitle">${escapeHtml(articleTitle)}</h2>
            ${content ? `<div class="newsContent">${content}</div>` : ""}
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
*{box-sizing:border-box}html,body{margin:0;padding:0;background:transparent;color:var(--text);font-family:var(--font);overflow:hidden}body{width:100%}img{display:block;max-width:100%}.shell{width:100%;padding:0}.frame{width:100%;display:grid;gap:18px;background:var(--bg);border:1px solid var(--line);border-radius:var(--radius-xl);box-shadow:var(--shadow);padding:28px}.header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}.title{margin:0;font-size:clamp(28px,3vw,40px);line-height:1.02;letter-spacing:-.045em;font-weight:800}.stack,.carouselWrap{display:grid;gap:18px}.newsCard,.slide{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow-soft);overflow:clip}.newsCard.hasMedia,.slide.hasMedia{display:grid;grid-template-columns:minmax(220px,320px) minmax(0,1fr);align-items:stretch}.newsCard.noMedia,.slide.noMedia{display:block}.mediaCol{background:var(--media-bg);min-height:220px}.media{width:100%;height:100%;object-fit:cover}.copyCol{padding:24px 26px;min-width:0}.newsDate{margin:0 0 10px;font-size:12px;line-height:1;color:var(--brand-deep);font-weight:800;letter-spacing:.09em;text-transform:uppercase}.newsTitle{margin:0 0 14px;font-size:clamp(28px,2.6vw,42px);line-height:1.08;letter-spacing:-.045em;font-weight:800;text-wrap:balance}.newsContent{display:grid;gap:12px;color:var(--muted);font-size:18px;line-height:1.75}.newsContent p{margin:0}.carouselWrap{align-items:start}.carouselHead{display:flex;justify-content:flex-end;align-items:center;gap:14px;flex-wrap:wrap}.nav{display:flex;gap:10px}.navBtn{width:44px;height:44px;border-radius:999px;border:1px solid var(--line-strong);background:var(--surface);color:var(--text);cursor:pointer;font-size:20px;font-weight:800;transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease}.navBtn:hover{transform:translateY(-1px);box-shadow:var(--shadow-soft);border-color:var(--line-strong)}.navBtn:disabled{opacity:.35;cursor:not-allowed;transform:none;box-shadow:none}.dots{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dot{width:10px;height:10px;border:0;border-radius:999px;background:rgba(0,0,0,.12);padding:0;cursor:pointer;transition:all .2s ease}.dot.is-active{width:30px;background:linear-gradient(90deg,var(--brand),color-mix(in srgb, var(--brand) 60%, white))}.viewport{overflow:hidden}.track{display:flex;gap:16px;will-change:transform;transition:transform .45s cubic-bezier(.22,.61,.36,1);align-items:flex-start}.slide{min-width:100%}.empty{padding:34px 22px;border-radius:var(--radius-lg);border:1px dashed var(--line-strong);background:var(--surface-soft);text-align:center}.empty h2{margin:0 0 10px;font-size:24px;line-height:1.1;letter-spacing:-.03em}.empty p{margin:0;color:var(--muted);font-size:15px;line-height:1.7}.reveal{opacity:0;transform:translateY(12px);animation:fadeUp .55s ease forwards}@keyframes fadeUp{to{opacity:1;transform:translateY(0)}}@media (max-width:940px){.frame{padding:22px 18px;border-radius:24px}.newsCard.hasMedia,.slide.hasMedia{grid-template-columns:1fr}.mediaCol{min-height:240px}.copyCol{padding:20px 18px}}@media (max-width:640px){.frame{padding:18px 14px;border-radius:20px}.title{font-size:clamp(24px,8vw,32px)}.newsTitle{font-size:clamp(22px,7vw,30px)}.newsContent{font-size:16px;line-height:1.68}.mediaCol{min-height:190px}}@media (prefers-reduced-motion:reduce){.reveal,.track,.dot,.navBtn{animation:none;transition:none}}
</style>
</head>
<body>
<div class="shell"><section class="frame" id="root"><header class="header reveal"><h1 class="title">${escapeHtml(title)}</h1></header>${articles.length === 0 ? empty : layout === "carousel" ? `<section class="carouselWrap" id="carouselRoot"><div class="carouselHead reveal"><div class="dots" aria-label="Navigation des actualités">${dots}</div><div class="nav"><button class="navBtn" type="button" data-prev aria-label="Actualité précédente">‹</button><button class="navBtn" type="button" data-next aria-label="Actualité suivante">›</button></div></div><div class="viewport"><div class="track" id="track">${carouselItems}</div></div></section>` : `<section class="stack">${listItems}</section>`}</section></div>
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
document.addEventListener('DOMContentLoaded',function(){ready();schedule(true);settle();});window.addEventListener('load',function(){ready();schedule(true);settle();});window.addEventListener('resize',function(){schedule(true);});if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){schedule(true);settle();}).catch(function(){});}Array.prototype.forEach.call(document.images||[],function(img){if(!img.complete)img.addEventListener('load',function(){schedule(true);settle();},{once:true});});setTimeout(function(){ready();schedule(true);},30);setTimeout(function(){schedule(true);},180);setTimeout(function(){schedule(true);},500);setTimeout(function(){schedule(true);},1000);setTimeout(function(){schedule(true);},1800);setTimeout(function(){schedule(true);},3200);
var shell=document.getElementById('carouselRoot');if(!shell)return;var track=document.getElementById('track');var slides=shell.querySelectorAll('[data-slide]');var prev=shell.querySelector('[data-prev]');var next=shell.querySelector('[data-next]');var dots=shell.querySelectorAll('[data-dot]');var index=0;function update(){if(!track)return;track.style.transform='translateX('+(-index*100)+'%)';dots.forEach(function(dot,i){dot.classList.toggle('is-active',i===index);});if(prev)prev.disabled=index===0;if(next)next.disabled=index===slides.length-1;schedule(true);}if(prev)prev.addEventListener('click',function(){if(index>0){index-=1;update();}});if(next)next.addEventListener('click',function(){if(index<slides.length-1){index+=1;update();}});dots.forEach(function(dot,i){dot.addEventListener('click',function(){index=i;update();});});update();
})();
</script>
</body></html>`;
}
