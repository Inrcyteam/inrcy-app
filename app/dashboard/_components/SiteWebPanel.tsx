"use client";

import styles from "../dashboard.module.css";
import ConnectionPill from "./ConnectionPill";
import StatusMessage from "./StatusMessage";
import SiteActusWidgetCode from "./SiteActusWidgetCode";
import ActusWidgetControls from "./ActusWidgetControls";
import SaveIcon from "./SaveIcon";

export default function SiteWebPanel(props: any) {
  const {
    siteWebAllGreen,
    hasSiteWebUrl,
    siteWebUrl,
    setSiteWebUrl,
    saveSiteWebUrl,
    deleteSiteWebUrl,
    siteWebUrlBusy,
    draftSiteWebUrlMeta,
    siteWebUrlNotice,
    siteWebGa4Connected,
    siteWebGa4MeasurementId,
    siteWebGa4PropertyId,
    disconnectSiteWebGa4,
    siteWebGa4Busy,
    connectSiteWebGa4,
    canConnectSiteWebGoogle,
    siteWebGa4Notice,
    siteWebGscConnected,
    siteWebGscProperty,
    disconnectSiteWebGsc,
    siteWebGscBusy,
    connectSiteWebGsc,
    siteWebGscNotice,
    siteWebActusLayout,
    setSiteWebActusLayout,
    siteWebActusLimit,
    setSiteWebActusLimit,
    siteWebActusDesign,
    setSiteWebActusDesign,
    siteWebActusTheme,
    setSiteWebActusTheme,
    siteWebActusAccent,
    setSiteWebActusAccent,
    siteWebSavedUrl,
    widgetTokenSiteWeb,
    showSiteWebWidgetCode,
    setShowSiteWebWidgetCode,
    saveSiteWebActusWidgetSettings,
    siteWebSettingsError,
    resetSiteWebAll,
  } = props;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(15,23,42,0.65)",
            colorScheme: "dark",
            padding: "8px 10px",
            borderRadius: 999,
            color: "rgba(255,255,255,0.92)",
            fontSize: 13,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: siteWebAllGreen
                ? "rgba(34,197,94,0.95)"
                : hasSiteWebUrl
                  ? "rgba(59,130,246,0.95)"
                  : "rgba(148,163,184,0.9)",
            }}
          />
          Statut : <strong>{hasSiteWebUrl ? ("ConnectÃ©") : "Ã€ configurer"}</strong>
        </span>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 14,
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Lien du site</div>
          <ConnectionPill connected={hasSiteWebUrl} />
        </div>
        <div className={styles.blockSub}>
          Le bouton <strong>Voir le site</strong> de la bulle utilisera ce lien.
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={siteWebUrl}
            onChange={(e) => setSiteWebUrl(e.target.value)}
            disabled={hasSiteWebUrl}
            placeholder="https://votre-site.fr"
            title={hasSiteWebUrl ? "Supprimez d'abord le lien enregistrÃ© pour en saisir un nouveau." : undefined}
            style={{
              flex: "1 1 280px",
              minWidth: 0,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(15,23,42,0.65)",
              colorScheme: "dark",
              padding: "10px 12px",
              color: "white",
              outline: "none",
              cursor: hasSiteWebUrl ? "not-allowed" : "text",
              opacity: hasSiteWebUrl ? 0.7 : 1,
            }}
          />

          {hasSiteWebUrl ? (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.disconnectBtn}`}
              onClick={() => void deleteSiteWebUrl()}
              disabled={siteWebUrlBusy}
              title="Supprimer le lien"
              aria-label="Supprimer le lien"
              style={{ minWidth: 44, paddingInline: 0, fontSize: 22, fontWeight: 900, lineHeight: 1 }}
            >
              Ã—
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.iconBtn}`}
              onClick={() => void saveSiteWebUrl()}
              disabled={siteWebUrlBusy}
              title="Enregistrer le lien"
              aria-label="Enregistrer le lien"
            >
              <SaveIcon />
            </button>
          )}

          <a
            href={draftSiteWebUrlMeta?.normalizedUrl || "#"}
            target="_blank"
            rel="noreferrer"
            className={`${styles.actionBtn} ${styles.viewBtn}`}
            style={{ pointerEvents: draftSiteWebUrlMeta ? "auto" : "none", opacity: draftSiteWebUrlMeta ? 1 : 0.5 }}
          >
            Voir le site
          </a>
        </div>
        {siteWebUrlNotice && <StatusMessage variant="success">{siteWebUrlNotice}</StatusMessage>}
      </div>
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 14,
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Google Analytics (GA4)</div>
          <ConnectionPill connected={siteWebGa4Connected} />
        </div>
        <div className={styles.blockSub}>Remplissage automatique des identifiants GA4 aprÃ¨s connexion</div>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>ID de mesure (ex: G-XXXXXXXXXX)</span>
          <input
            value={siteWebGa4MeasurementId}
            readOnly
            aria-readonly="true"
            placeholder="Remplissage automatique aprÃ¨s connexion"
            style={{
              width: "100%",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(15,23,42,0.4)",
              colorScheme: "dark",
              padding: "10px 12px",
              color: "rgba(255,255,255,0.88)",
              outline: "none",
              cursor: "not-allowed",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>Property ID (numÃ©rique, ex: 123456789)</span>
          <input
            value={siteWebGa4PropertyId}
            readOnly
            aria-readonly="true"
            inputMode="numeric"
            placeholder="Remplissage automatique aprÃ¨s connexion"
            style={{
              width: "100%",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(15,23,42,0.4)",
              colorScheme: "dark",
              padding: "10px 12px",
              color: "rgba(255,255,255,0.88)",
              outline: "none",
              cursor: "not-allowed",
            }}
          />
        </label>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {siteWebGa4Connected ? (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.disconnectBtn}`}
              onClick={() => void disconnectSiteWebGa4()}
              disabled={siteWebGa4Busy}
              title="DÃ©connecter (GA4)"
            >
              {siteWebGa4Busy ? "DÃ©connexion..." : "DÃ©connecter"}
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.connectBtn}`}
              onClick={connectSiteWebGa4}
              disabled={!canConnectSiteWebGoogle}
              title={!hasSiteWebUrl ? "Renseigne le lien du site web avant de connecter Google Analytics." : "Connecter Google Analytics"}
            >
              Connecter Google Analytics
            </button>
          )}
        </div>
      </div>
      {siteWebGa4Notice && <StatusMessage variant="success">{siteWebGa4Notice}</StatusMessage>}

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 14,
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Google Search Console</div>
          <ConnectionPill connected={siteWebGscConnected} />
        </div>
        <div className={styles.blockSub}>Remplissage automatique des identifiants GSC aprÃ¨s connexion</div>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>
            PropriÃ©tÃ© (ex: <code>sc-domain:monsite.fr</code> ou <code>https://monsite.fr/</code>)
          </span>
          <input
            value={siteWebGscProperty}
            readOnly
            aria-readonly="true"
            placeholder="Remplissage automatique aprÃ¨s connexion"
            style={{
              width: "100%",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(15,23,42,0.4)",
              colorScheme: "dark",
              padding: "10px 12px",
              color: "rgba(255,255,255,0.88)",
              outline: "none",
              cursor: "not-allowed",
            }}
          />
        </label>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {siteWebGscConnected ? (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.disconnectBtn}`}
              onClick={() => void disconnectSiteWebGsc()}
              disabled={siteWebGscBusy}
              title="DÃ©connecter (GSC)"
            >
              {siteWebGscBusy ? "DÃ©connexion..." : "DÃ©connecter"}
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.connectBtn}`}
              onClick={connectSiteWebGsc}
              disabled={!canConnectSiteWebGoogle}
              title={!hasSiteWebUrl ? "Renseigne le lien du site web avant de connecter Google Search Console." : "Connecter Google Search Console"}
            >
              Connecter Google Search Console
            </button>
          )}
        </div>
      </div>
      {siteWebGscNotice && <StatusMessage variant="success">{siteWebGscNotice}</StatusMessage>}

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 14,
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Widget Â« Actus Â»</div>
        </div>
        <div className={styles.blockSub}>
          Collez ce code iframe dans votre site (WordPress, Wix, Webflow, HTMLâ€¦) pour afficher automatiquement vos derniÃ¨res actus publiÃ©es depuis Booster.
        </div>

        <ActusWidgetControls
          layout={siteWebActusLayout}
          setLayout={setSiteWebActusLayout}
          limit={siteWebActusLimit}
          setLimit={setSiteWebActusLimit}
          design={siteWebActusDesign}
          setDesign={setSiteWebActusDesign}
          theme={siteWebActusTheme}
          setTheme={setSiteWebActusTheme}
          accent={siteWebActusAccent}
          setAccent={setSiteWebActusAccent}
        />

        <SiteActusWidgetCode
          savedUrl={siteWebSavedUrl}
          source="site_web"
          layout={siteWebActusLayout}
          limit={siteWebActusLimit}
          design={siteWebActusDesign}
          theme={siteWebActusTheme}
          accent={siteWebActusAccent}
          token={widgetTokenSiteWeb}
          showCode={showSiteWebWidgetCode}
          onToggle={() => setShowSiteWebWidgetCode((prev: boolean) => !prev)}
          onHideCode={() => setShowSiteWebWidgetCode(false)}
          onGenerate={saveSiteWebActusWidgetSettings}
        />
      </div>

      {siteWebSettingsError && (
        <div style={{ color: "rgba(248,113,113,0.95)", fontSize: 12 }}>{siteWebSettingsError}</div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.resetBtn}`}
          onClick={resetSiteWebAll}
          title="RÃ©initialiser (lien + GA4 + Search Console)"
        >
          RÃ©initialiser
        </button>
      </div>
    </div>
  );
}

