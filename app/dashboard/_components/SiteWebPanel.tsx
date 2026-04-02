"use client";

import styles from "../dashboard.module.css";
import ConnectionPill from "./ConnectionPill";
import StatusMessage from "./StatusMessage";
import SiteActusWidgetCode from "./SiteActusWidgetCode";
import SaveIcon from "./SaveIcon";

export default function SiteWebPanel(props: any) {
  const {
    siteWebAllGreen,
    hasSiteWebUrl,
    siteWebUrl,
    setSiteWebUrl,
    saveSiteWebUrl,
    deleteSiteWebUrl,
    draftSiteWebUrlMeta,
    siteWebUrlNotice,
    siteWebGa4Connected,
    siteWebGa4MeasurementId,
    siteWebGa4PropertyId,
    disconnectSiteWebGa4,
    connectSiteWebGa4,
    canConnectSiteWebGoogle,
    siteWebGa4Notice,
    siteWebGscConnected,
    siteWebGscProperty,
    disconnectSiteWebGsc,
    connectSiteWebGsc,
    siteWebGscNotice,
    siteWebActusLayout,
    setSiteWebActusLayout,
    siteWebActusLimit,
    setSiteWebActusLimit,
    siteWebActusFont,
    setSiteWebActusFont,
    siteWebActusTheme,
    setSiteWebActusTheme,
    siteWebSavedUrl,
    widgetTokenSiteWeb,
    showSiteWebWidgetCode,
    setShowSiteWebWidgetCode,
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
          Statut : <strong>{hasSiteWebUrl ? (siteWebAllGreen ? "Connecté" : "À connecter") : "À configurer"}</strong>
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
            title={hasSiteWebUrl ? "Supprimez d'abord le lien enregistré pour en saisir un nouveau." : undefined}
            style={{
              flex: "1 1 280px",
              minWidth: 220,
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
              onClick={deleteSiteWebUrl}
              title="Supprimer le lien"
              aria-label="Supprimer le lien"
              style={{ minWidth: 44, paddingInline: 0, fontSize: 22, fontWeight: 900, lineHeight: 1 }}
            >
              ×
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.iconBtn}`}
              onClick={saveSiteWebUrl}
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
        <div className={styles.blockSub}>Connexion automatique : les identifiants GA4 se remplissent après OAuth</div>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>ID de mesure (ex: G-XXXXXXXXXX)</span>
          <input
            value={siteWebGa4MeasurementId}
            readOnly
            aria-readonly="true"
            placeholder="Remplissage automatique après connexion"
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
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>Property ID (numérique, ex: 123456789)</span>
          <input
            value={siteWebGa4PropertyId}
            readOnly
            aria-readonly="true"
            inputMode="numeric"
            placeholder="Remplissage automatique après connexion"
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
              onClick={disconnectSiteWebGa4}
              title="Déconnecter (GA4)"
            >
              Déconnecter
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
        <div className={styles.blockSub}>Connexion automatique : la propriété GSC se remplit après OAuth</div>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>
            Propriété (ex: <code>sc-domain:monsite.fr</code> ou <code>https://monsite.fr/</code>)
          </span>
          <input
            value={siteWebGscProperty}
            readOnly
            aria-readonly="true"
            placeholder="Remplissage automatique après connexion"
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
              onClick={disconnectSiteWebGsc}
              title="Déconnecter (GSC)"
            >
              Déconnecter
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
          <div className={styles.blockTitle}>Widget « Actus »</div>
        </div>
        <div className={styles.blockSub}>
          Collez ce code iframe dans votre site (WordPress, Wix, Webflow, HTML…) pour afficher automatiquement vos dernières actus publiées depuis Booster.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span className={styles.blockSub}><strong>Affichage</strong></span>
            <select
              value={siteWebActusLayout}
              onChange={(e) => setSiteWebActusLayout(e.target.value === "carousel" ? "carousel" : "list")}
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(15,23,42,0.65)",
                colorScheme: "dark",
                padding: "10px 12px",
                color: "rgba(255,255,255,0.92)",
                outline: "none",
              }}
            >
              <option value="list">Liste</option>
              <option value="carousel">Carousel</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span className={styles.blockSub}><strong>Nombre d'actus</strong></span>
            <select
              value={String(siteWebActusLimit)}
              onChange={(e) => setSiteWebActusLimit(Math.min(7, Math.max(3, Number(e.target.value) || 5)))}
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(15,23,42,0.65)",
                colorScheme: "dark",
                padding: "10px 12px",
                color: "rgba(255,255,255,0.92)",
                outline: "none",
              }}
            >
              {[3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>{n} dernières actus</option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span className={styles.blockSub}><strong>Police</strong></span>
            <select
              value={siteWebActusFont}
              onChange={(e) => setSiteWebActusFont((( ["site", "inter", "poppins", "montserrat", "lora"] as const).includes(e.target.value as never) ? e.target.value : "site") as "site" | "inter" | "poppins" | "montserrat" | "lora")}
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(15,23,42,0.65)",
                colorScheme: "dark",
                padding: "10px 12px",
                color: "rgba(255,255,255,0.92)",
                outline: "none",
              }}
            >
              <option value="site">Adaptative site</option>
              <option value="inter">Inter</option>
              <option value="poppins">Poppins</option>
              <option value="montserrat">Montserrat</option>
              <option value="lora">Lora</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span className={styles.blockSub}><strong>Couleur de fond</strong></span>
            <select
              value={siteWebActusTheme}
              onChange={(e) => setSiteWebActusTheme((( ["white", "dark", "gray", "nature", "sand"] as const).includes(e.target.value as never) ? e.target.value : "nature") as "white" | "dark" | "gray" | "nature" | "sand")}
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(15,23,42,0.65)",
                colorScheme: "dark",
                padding: "10px 12px",
                color: "rgba(255,255,255,0.92)",
                outline: "none",
              }}
            >
              <option value="white">Blanc</option>
              <option value="dark">Noir</option>
              <option value="gray">Gris</option>
              <option value="nature">Vert doux</option>
              <option value="sand">Sable</option>
            </select>
          </label>
        </div>

        <SiteActusWidgetCode
          savedUrl={siteWebSavedUrl}
          source="site_web"
          layout={siteWebActusLayout}
          limit={siteWebActusLimit}
          font={siteWebActusFont}
          theme={siteWebActusTheme}
          token={widgetTokenSiteWeb}
          showCode={showSiteWebWidgetCode}
          onToggle={() => setShowSiteWebWidgetCode((prev: boolean) => !prev)}
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
          title="Réinitialiser (lien + GA4 + Search Console)"
        >
          Réinitialiser
        </button>
      </div>
    </div>
  );
}
