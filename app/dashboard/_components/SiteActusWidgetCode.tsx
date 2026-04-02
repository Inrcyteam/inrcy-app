"use client";
import { useEffect, useState } from "react";
import styles from "../dashboard.module.css";
import { getNormalizedSiteDomain } from "../dashboard.utils";
import type { ActusFont, ActusLayout, ActusTheme } from "../dashboard.types";

type SiteActusWidgetCodeProps = { savedUrl: string; source: "inrcy_site" | "site_web"; layout: ActusLayout; limit: number; font: ActusFont; theme: ActusTheme; token: string; showCode: boolean; onToggle: () => void; };

export default function SiteActusWidgetCode({ savedUrl, source, layout, limit, font, theme, token, showCode, onToggle }: SiteActusWidgetCodeProps) {
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const domain = getNormalizedSiteDomain(savedUrl);
  const publicAppOrigin = process.env.NEXT_PUBLIC_APP_URL || "https://app.inrcy.com";
  const hasSavedUrl = !!savedUrl.trim() && !!domain;
  const iframeId = `inrcy-actus-${domain || "site"}-${layout}`.replace(/[^a-z0-9_-]/gi, "-");
  const initialHeight = layout === "carousel" ? 560 : 260;
  const embedUrl = `${publicAppOrigin}/embed/actus?frameId=${encodeURIComponent(iframeId)}&domain=${encodeURIComponent(domain || "votre-site.fr")}&source=${encodeURIComponent(source)}&layout=${encodeURIComponent(layout)}&limit=${encodeURIComponent(String(limit))}&font=${encodeURIComponent(font)}&theme=${encodeURIComponent(theme)}&title=${encodeURIComponent("Actualités")}&token=${encodeURIComponent(token)}`;
  const snippet = `<iframe id="${iframeId}" src="${embedUrl}" width="100%" height="${initialHeight}" style="border:0;width:100%;max-width:100%;overflow:hidden;border-radius:24px;background:transparent;display:block;" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" scrolling="no" title="Actualités iNrCy"></iframe>
<script>
(function(){
  var iframe=document.getElementById("${iframeId}");
  if(!iframe)return;
  var lastHeight=${initialHeight};
  var ready=false;
  function applyHeight(value){ var h=parseInt(value,10); if(!h||h<140)return; if(Math.abs(h-lastHeight)<2)return; lastHeight=h; iframe.style.height=h+"px"; iframe.setAttribute("height",String(h)); }
  function send(type){ if(!iframe.contentWindow)return; iframe.contentWindow.postMessage({source:"inrcy-host",type:type,frameId:"${iframeId}"},"${publicAppOrigin}"); }
  function onMessage(event){ if(event.origin!=="${publicAppOrigin}")return; if(event.source!==iframe.contentWindow)return; var data=event.data||{}; if(data.frameId!=="${iframeId}")return; if(data.type==="inrcy:embed-ready"){ ready=true; applyHeight(data.height); send("inrcy:embed-init"); return; } if(data.type!=="inrcy:embed-resize")return; applyHeight(data.height); }
  window.addEventListener("message",onMessage,false);
  iframe.addEventListener("load",function(){ send("inrcy:embed-init"); });
  setTimeout(function(){ send("inrcy:embed-ping"); },120);
  setTimeout(function(){ if(!ready) send("inrcy:embed-ping"); },500);
  setTimeout(function(){ if(!ready) send("inrcy:embed-ping"); },1200);
  setTimeout(function(){ if(!ready) send("inrcy:embed-ping"); },2600);
})();
<\/script>`;
  useEffect(() => {
    if (!copyNotice) return;
    const timer = window.setTimeout(() => setCopyNotice(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copyNotice]);

  return <>
    {showCode && hasSavedUrl && <div aria-label="Code du widget" onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} style={{ width: "100%", minHeight: 170, borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(15,23,42,0.65)", padding: "10px 12px", color: "rgba(255,255,255,0.92)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-all", userSelect: "none", WebkitUserSelect: "none", MozUserSelect: "none", msUserSelect: "none", pointerEvents: "none" }}>{snippet}</div>}
    <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
      <div className={styles.blockSub}>Images affichées automatiquement quand une image est présente dans l'actu.</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={onToggle}
          disabled={!hasSavedUrl}
          title={!hasSavedUrl ? "Enregistrez d'abord un lien de site." : undefined}
          style={!hasSavedUrl ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
        >
          {showCode ? "Masquer le code" : "Afficher le code"}
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          disabled={!hasSavedUrl}
          title={!hasSavedUrl ? "Enregistrez d'abord un lien de site." : undefined}
          style={!hasSavedUrl ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          onClick={async () => {
            if (!hasSavedUrl) return;
            try {
              await navigator.clipboard?.writeText(snippet);
              setCopyNotice("code copié");
            } catch {
              setCopyNotice(null);
            }
          }}
        >
          Copier le code
        </button>
      </div>
    </div>
    {copyNotice ? <div className={styles.blockSub} style={{ color: "#4ade80", fontWeight: 800 }}>{copyNotice}</div> : null}
    <div className={styles.blockSub}><strong>Où le coller ?</strong> Sur WordPress : un bloc <em>HTML personnalisé</em> (Elementor → widget HTML). Sur Wix : <em>Embed Code</em>. Sur Webflow : <em>Embed</em>.</div>
  </>;
}
