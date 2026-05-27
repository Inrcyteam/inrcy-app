"use client";
import { useEffect, useMemo, useState } from "react";
import styles from "../dashboard.module.css";
import { getNormalizedSiteDomain } from "../dashboard.utils";
import type { ActusFont, ActusLayout, ActusTheme } from "../dashboard.types";

type GeneratedActusWidgetConfig = {
  savedUrl: string;
  source: "inrcy_site" | "site_web";
  layout: ActusLayout;
  limit: number;
  font: ActusFont;
  theme: ActusTheme;
  token: string;
};

type SiteActusWidgetCodeProps = {
  savedUrl: string;
  source: "inrcy_site" | "site_web";
  layout: ActusLayout;
  limit: number;
  font: ActusFont;
  theme: ActusTheme;
  token: string;
  showCode: boolean;
  onToggle: () => void;
  onHideCode: () => void;
  onGenerate: () => Promise<boolean> | boolean;
};

const getConfigKey = (config: GeneratedActusWidgetConfig | null) => {
  if (!config) return "";
  return [config.savedUrl, config.source, config.layout, config.limit, config.font, config.theme, config.token].join("|");
};

const buildSnippet = (config: GeneratedActusWidgetConfig) => {
  const domain = getNormalizedSiteDomain(config.savedUrl);
  const publicAppOrigin = process.env.NEXT_PUBLIC_APP_URL || "https://app.inrcy.com";
  const iframeId = `inrcy-actus-${domain || "site"}-${config.layout}`.replace(/[^a-z0-9_-]/gi, "-");
  const initialHeight = config.layout === "carousel" ? 560 : 260;
  const embedUrl = `${publicAppOrigin}/embed/actus?frameId=${encodeURIComponent(iframeId)}&domain=${encodeURIComponent(domain || "votre-site.fr")}&source=${encodeURIComponent(config.source)}&layout=${encodeURIComponent(config.layout)}&limit=${encodeURIComponent(String(config.limit))}&font=${encodeURIComponent(config.font)}&theme=${encodeURIComponent(config.theme)}&title=${encodeURIComponent("Actualités")}&token=${encodeURIComponent(config.token)}`;

  return `<iframe id="${iframeId}" src="${embedUrl}" width="100%" height="${initialHeight}" style="border:0;width:100%;max-width:100%;overflow:hidden;border-radius:24px;background:transparent;display:block;" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" scrolling="no" title="Actualités iNrCy"></iframe>
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
};

export default function SiteActusWidgetCode({
  savedUrl,
  source,
  layout,
  limit,
  font,
  theme,
  token,
  showCode,
  onToggle,
  onHideCode,
  onGenerate,
}: SiteActusWidgetCodeProps) {
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [generateNotice, setGenerateNotice] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedConfig, setGeneratedConfig] = useState<GeneratedActusWidgetConfig | null>(null);

  const currentConfig = useMemo<GeneratedActusWidgetConfig>(() => ({
    savedUrl,
    source,
    layout,
    limit,
    font,
    theme,
    token,
  }), [font, layout, limit, savedUrl, source, theme, token]);

  const domain = getNormalizedSiteDomain(savedUrl);
  const hasSavedUrl = !!savedUrl.trim() && !!domain;
  const hasToken = !!token.trim();
  const hasGeneratedCode = !!generatedConfig;
  const paramsChanged = hasGeneratedCode && getConfigKey(generatedConfig) !== getConfigKey(currentConfig);
  const codeReady = hasSavedUrl && hasToken && !!generatedConfig && !paramsChanged;
  const snippet = generatedConfig ? buildSnippet(generatedConfig) : "";

  useEffect(() => {
    if (!copyNotice) return;
    const timer = window.setTimeout(() => setCopyNotice(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copyNotice]);

  useEffect(() => {
    if (!generateNotice) return;
    const timer = window.setTimeout(() => setGenerateNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [generateNotice]);

  useEffect(() => {
    if (!codeReady && showCode) onHideCode();
  }, [codeReady, onHideCode, showCode]);

  const handleGenerate = async () => {
    if (!hasSavedUrl) {
      setGenerateNotice("Enregistrez d'abord le lien du site.");
      return;
    }
    if (!hasToken) {
      setGenerateNotice("Token du widget en préparation. Réessayez dans quelques secondes.");
      return;
    }

    setIsGenerating(true);
    setCopyNotice(null);
    try {
      const ok = await onGenerate();
      if (ok === false) return;
      setGeneratedConfig(currentConfig);
      onHideCode();
      setGenerateNotice("✅ Paramètres enregistrés. Code généré.");
    } catch {
      setGenerateNotice("Enregistrement impossible pour le moment.");
    } finally {
      setIsGenerating(false);
    }
  };

  return <>
    <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
      <div className={styles.blockSub}>Images affichées automatiquement quand une image est présente dans l'actu.</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={handleGenerate}
          disabled={!hasSavedUrl || !hasToken || isGenerating}
          title={!hasSavedUrl ? "Enregistrez d'abord un lien de site." : !hasToken ? "Token du widget en préparation." : undefined}
          style={!hasSavedUrl || !hasToken || isGenerating ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
        >
          {isGenerating ? "Enregistrement..." : hasGeneratedCode ? "Réenregistrer et régénérer" : "Enregistrer et générer le code"}
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={onToggle}
          disabled={!codeReady}
          title={!codeReady ? "Enregistrez et générez le code avant de l'afficher." : undefined}
          style={!codeReady ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
        >
          {showCode ? "Masquer le code" : "Afficher le code"}
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          disabled={!codeReady}
          title={!codeReady ? "Enregistrez et générez le code avant de copier." : undefined}
          style={!codeReady ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          onClick={async () => {
            if (!codeReady) return;
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

    {!hasGeneratedCode ? (
      <div className={styles.blockSub} style={{ color: "rgba(251,191,36,0.95)", fontWeight: 800 }}>
        Choisissez les paramètres, puis cliquez sur “Enregistrer et générer le code”.
      </div>
    ) : paramsChanged ? (
      <div className={styles.blockSub} style={{ color: "rgba(251,191,36,0.95)", fontWeight: 800 }}>
        Paramètres modifiés. Enregistrez pour générer un nouveau code.
      </div>
    ) : null}

    {generateNotice ? <div className={styles.blockSub} style={{ color: generateNotice.startsWith("✅") ? "#4ade80" : "rgba(251,191,36,0.95)", fontWeight: 800 }}>{generateNotice}</div> : null}
    {showCode && codeReady && <div aria-label="Code du widget" onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} style={{ width: "100%", minHeight: 170, borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(15,23,42,0.65)", padding: "10px 12px", color: "rgba(255,255,255,0.92)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-all", userSelect: "none", WebkitUserSelect: "none", MozUserSelect: "none", msUserSelect: "none", pointerEvents: "none" }}>{snippet}</div>}
    {copyNotice ? <div className={styles.blockSub} style={{ color: "#4ade80", fontWeight: 800 }}>{copyNotice}</div> : null}
    <div className={styles.blockSub}><strong>Où le coller ?</strong> Sur WordPress : un bloc <em>HTML personnalisé</em> (Elementor → widget HTML). Sur Wix : <em>Embed Code</em>. Sur Webflow : <em>Embed</em>.</div>
  </>;
}
