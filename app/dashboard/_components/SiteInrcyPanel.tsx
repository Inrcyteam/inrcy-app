"use client";

import styles from "../dashboard.module.css";
import ConnectionPill from "./ConnectionPill";
import StatusMessage from "./StatusMessage";
import SiteActusWidgetCode from "./SiteActusWidgetCode";
import SaveIcon from "./SaveIcon";

export default function SiteInrcyPanel(props: any) {
  const {
    siteInrcyOwnership,
    siteInrcyAllGreen,
    siteInrcyContactEmail,
    hasSiteInrcyUrl,
    siteInrcyUrl,
    setSiteInrcyUrl,
    saveSiteInrcyUrl,
    draftSiteInrcyUrlMeta,
    siteInrcyUrlNotice,
    siteInrcyGa4Connected,
    ga4MeasurementId,
    ga4PropertyId,
    disconnectSiteInrcyGa4,
    connectSiteInrcyGa4,
    canConnectSiteInrcyGoogle,
    canConfigureSite,
    siteInrcyGa4Notice,
    siteInrcyGscConnected,
    gscProperty,
    disconnectSiteInrcyGsc,
    connectSiteInrcyGsc,
    siteInrcyGscNotice,
    siteInrcyActusLayout,
    setSiteInrcyActusLayout,
    siteInrcyActusLimit,
    setSiteInrcyActusLimit,
    siteInrcyActusFont,
    setSiteInrcyActusFont,
    siteInrcyActusTheme,
    setSiteInrcyActusTheme,
    siteInrcySavedUrl,
    widgetTokenInrcySite,
    showSiteInrcyWidgetCode,
    setShowSiteInrcyWidgetCode,
    siteInrcySettingsError,
    resetSiteInrcyAll,
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
              background:
                siteInrcyOwnership === "none"
                  ? "rgba(148,163,184,0.9)"
                  : siteInrcyAllGreen
                    ? "rgba(34,197,94,0.95)"
                    : "rgba(59,130,246,0.95)",
            }}
          />
          Statut : <strong>{siteInrcyOwnership === "none" ? "Aucun site" : siteInrcyAllGreen ? "Connecté" : "À connecter"}</strong>
        </span>

        {!!siteInrcyContactEmail && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(15,23,42,0.65)",
              colorScheme: "dark",
              padding: "8px 10px",
              borderRadius: 999,
              color: "rgba(255,255,255,0.85)",
              fontSize: 13,
            }}
          >
            Email : <strong style={{ marginLeft: 6 }}>{siteInrcyContactEmail}</strong>
          </span>
        )}
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
          <ConnectionPill connected={siteInrcyOwnership !== "none" && hasSiteInrcyUrl} />
        </div>
        <div className={styles.blockSub}>
          Le bouton <strong>Voir le site</strong> de la bulle utilisera ce lien.
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={siteInrcyUrl}
            onChange={(e) => setSiteInrcyUrl(e.target.value)}
            disabled={siteInrcyOwnership === "none"}
            placeholder="https://..."
            style={{
              flex: "1 1 280px",
              minWidth: 220,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(15,23,42,0.65)",
              colorScheme: "dark",
              padding: "10px 12px",
              color: siteInrcyOwnership === "none" ? "rgba(255,255,255,0.75)" : "white",
              outline: "none",
            }}
          />

          <button
            type="button"
            className={`${styles.actionBtn} ${styles.iconBtn}`}
            onClick={saveSiteInrcyUrl}
            disabled={siteInrcyOwnership === "none"}
            title={siteInrcyOwnership === "none" ? "Aucun site iNrCy associé" : "Enregistrer le lien"}
            aria-label="Enregistrer le lien"
          >
            <SaveIcon />
          </button>

          <a
            href={draftSiteInrcyUrlMeta?.normalizedUrl || "#"}
            target="_blank"
            rel="noreferrer"
            className={`${styles.actionBtn} ${styles.viewBtn}`}
            style={{ pointerEvents: draftSiteInrcyUrlMeta ? "auto" : "none", opacity: draftSiteInrcyUrlMeta ? 1 : 0.5 }}
          >
            Voir le site
          </a>
        </div>
        {siteInrcyUrlNotice && <StatusMessage variant="success">{siteInrcyUrlNotice}</StatusMessage>}
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
          <ConnectionPill connected={siteInrcyGa4Connected} />
        </div>
        <div className={styles.blockSub}>Connexion automatique : les identifiants GA4 se remplissent après OAuth</div>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>ID de mesure (ex: G-XXXXXXXXXX)</span>
          <input
            value={ga4MeasurementId}
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
            value={ga4PropertyId}
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
          {siteInrcyGa4Connected ? (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.disconnectBtn}`}
              onClick={disconnectSiteInrcyGa4}
              disabled={siteInrcyOwnership === "none"}
              title={siteInrcyOwnership === "none" ? "Aucun site iNrCy associé" : "Déconnecter (GA4)"}
            >
              Déconnecter
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.connectBtn}`}
              onClick={connectSiteInrcyGa4}
              disabled={!canConnectSiteInrcyGoogle}
              title={
                !canConfigureSite
                  ? "Aucun site iNrCy associé"
                  : !hasSiteInrcyUrl
                    ? "Renseigne le lien du site iNrCy avant de connecter Google Analytics."
                    : "Connecter Google Analytics"
              }
            >
              Connecter Google Analytics
            </button>
          )}
        </div>
      </div>
      {siteInrcyGa4Notice && <StatusMessage variant="success">{siteInrcyGa4Notice}</StatusMessage>}
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
          <ConnectionPill connected={siteInrcyGscConnected} />
        </div>
        <div className={styles.blockSub}>Connexion automatique : la propriété GSC se remplit après OAuth</div>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>
            Propriété (ex: <code>sc-domain:monsite.fr</code> ou <code>https://monsite.fr/</code>)
          </span>
          <input
            value={gscProperty}
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
          {siteInrcyGscConnected ? (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.disconnectBtn}`}
              onClick={disconnectSiteInrcyGsc}
              disabled={siteInrcyOwnership === "none"}
              title={siteInrcyOwnership === "none" ? "Aucun site iNrCy associé" : "Déconnecter (GSC)"}
            >
              Déconnecter
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.connectBtn}`}
              onClick={connectSiteInrcyGsc}
              disabled={!canConnectSiteInrcyGoogle}
              title={
                !canConfigureSite
                  ? "Aucun site iNrCy associé"
                  : !hasSiteInrcyUrl
                    ? "Renseigne le lien du site iNrCy avant de connecter Google Search Console."
                    : "Connecter Google Search Console"
              }
            >
              Connecter Google Search Console
            </button>
          )}
        </div>
      </div>
      {siteInrcyGscNotice && <StatusMessage variant="success">{siteInrcyGscNotice}</StatusMessage>}
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
          Collez ce code iframe dans votre site iNrCy (Elementor → widget HTML) pour afficher automatiquement vos dernières actus publiées depuis Booster.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span className={styles.blockSub}><strong>Affichage</strong></span>
            <select
              value={siteInrcyActusLayout}
              onChange={(e) => setSiteInrcyActusLayout(e.target.value === "carousel" ? "carousel" : "list")}
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
              value={String(siteInrcyActusLimit)}
              onChange={(e) => setSiteInrcyActusLimit(Math.min(7, Math.max(3, Number(e.target.value) || 5)))}
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
              value={siteInrcyActusFont}
              onChange={(e) => setSiteInrcyActusFont((( ["site", "inter", "poppins", "montserrat", "lora"] as const).includes(e.target.value as never) ? e.target.value : "site") as "site" | "inter" | "poppins" | "montserrat" | "lora")}
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
              value={siteInrcyActusTheme}
              onChange={(e) => setSiteInrcyActusTheme((( ["white", "dark", "gray", "nature", "sand"] as const).includes(e.target.value as never) ? e.target.value : "nature") as "white" | "dark" | "gray" | "nature" | "sand")}
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
          savedUrl={siteInrcySavedUrl}
          source="inrcy_site"
          layout={siteInrcyActusLayout}
          limit={siteInrcyActusLimit}
          font={siteInrcyActusFont}
          theme={siteInrcyActusTheme}
          token={widgetTokenInrcySite}
          showCode={showSiteInrcyWidgetCode}
          onToggle={() => setShowSiteInrcyWidgetCode((prev: boolean) => !prev)}
        />
      </div>

      {siteInrcySettingsError && (
        <div style={{ color: "rgba(248,113,113,0.95)", fontSize: 12 }}>{siteInrcySettingsError}</div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.resetBtn}`}
          onClick={resetSiteInrcyAll}
          disabled={siteInrcyOwnership === "none"}
          title={siteInrcyOwnership === "none" ? "Aucun site iNrCy" : "Réinitialiser (lien + GA4 + Search Console)"}
        >
          Réinitialiser
        </button>
      </div>
    </div>
  );
}
