"use client";


import styles from "../dashboard.module.css";
import ConnectionPill from "./ConnectionPill";
import StatusMessage from "./StatusMessage";

export default function InstagramPanel(props: any) {
  const {
    instagramConnected,
    instagramAccountConnected,
    instagramConnectionStatus,
    instagramUsername,
    connectInstagramAccount,
    connectInstagramBusinessAccount,
    disconnectInstagramAccount,
    igAccountsLoading,
    loadInstagramAccounts,
    igSelectedPageId,
    setIgSelectedPageId,
    igAccounts,
    saveInstagramProfile,
    igAccountsError,
    instagramUrl,
    instagramUrlNotice,
    instagramUrlError,
    disconnectInstagramProfile,
    instagramAccountBusy,
    instagramProfileBusy,
    instagramProfileAction,
  } = props;

  const startStandard = () => {
    connectInstagramAccount();
  };

  const startBusiness = () => {
    connectInstagramBusinessAccount();
  };

  const disconnectAll = () => {
    void disconnectInstagramAccount();
  };

  const handleProfileConnect = () => {
    void saveInstagramProfile();
  };

  const handleProfileDisconnect = () => {
    void disconnectInstagramProfile();
  };

  const instagramNeedsUpdate = instagramConnectionStatus === "needs_update" && (instagramConnected || instagramAccountConnected);
  const instagramStatusLabel = instagramNeedsUpdate ? "À actualiser" : instagramConnected ? "Connecté" : instagramAccountConnected ? "Compte connecté" : "À connecter";
  const instagramStatusDot = instagramNeedsUpdate
    ? "rgba(245,158,11,0.95)"
    : instagramConnected
      ? "rgba(34,197,94,0.95)"
      : instagramAccountConnected
        ? "rgba(59,130,246,0.95)"
        : "rgba(148,163,184,0.9)";

  const displayAccountsError = !instagramConnected && !instagramAccountConnected ? null : igAccountsError;

  const singleFieldStyle = {
    width: "100%" as const,
    minWidth: 0,
    maxWidth: "100%",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(15,23,42,0.65)",
    colorScheme: "dark" as const,
    padding: "10px 12px",
    color: "white",
    outline: "none",
  };

  const responsiveActionsRow = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
    gap: 10,
    alignItems: "center",
    width: "100%",
  } as const;

  return (
    <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
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
              background: instagramStatusDot,
            }}
          />
          Statut : <strong>{instagramStatusLabel}</strong>
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
          <div className={styles.blockTitle}>Compte connecté</div>
          <ConnectionPill connected={instagramAccountConnected} status={instagramNeedsUpdate ? "needs_update" : undefined} />
        </div>
        <div className={styles.blockSub}>
          Instagram peut être connecté en <strong>standard</strong> ou en <strong>business via Facebook Business</strong>. Pour la sélection du profil, un compte <strong>Business / Creator</strong> relié à une Page Facebook reste nécessaire.
        </div>

        <div style={{ width: "100%", minWidth: 0 }}>
          <input
            value={instagramUsername}
            readOnly
            placeholder={instagramAccountConnected ? "Compte connecté" : "Aucun compte connecté"}
            style={{
              ...singleFieldStyle,
              opacity: instagramAccountConnected ? 1 : 0.8,
            }}
          />
        </div>

        <div style={{ ...responsiveActionsRow, justifyItems: "stretch" }}>
          {instagramAccountConnected ? (
            <>
              {instagramNeedsUpdate ? (
                <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={startStandard} disabled={instagramAccountBusy} style={{ width: "100%" }}>
                  Actualiser
                </button>
              ) : null}
              <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnectAll} disabled={instagramAccountBusy} style={{ width: "100%" }}>
                {instagramAccountBusy ? "Déconnexion..." : "Déconnexion"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className={`${styles.actionBtn} ${styles.secondaryBtn}`} onClick={startStandard} style={{ width: "100%" }}>
                Connexion standard
              </button>
              <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={startBusiness} style={{ width: "100%" }}>
                Connexion business
              </button>
            </>
          )}
        </div>
      </div>

      {instagramAccountConnected ? (
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
            <div className={styles.blockTitle}>Compte Instagram à connecter</div>
            <ConnectionPill connected={instagramConnected} status={instagramNeedsUpdate ? "needs_update" : undefined} />
          </div>
          <div className={styles.blockSub}>On liste les Pages Facebook qui possèdent un Instagram Business/Creator.</div>

          <div style={responsiveActionsRow}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.secondaryBtn}`}
              onClick={() => loadInstagramAccounts()}
              disabled={igAccountsLoading || instagramProfileBusy}
              style={{ width: "100%" }}
            >
              {igAccountsLoading ? "Chargement..." : "Charger mes comptes"}
            </button>

            <select
              value={igSelectedPageId}
              onChange={(e) => setIgSelectedPageId(e.target.value)}
              disabled={instagramProfileBusy}
              style={singleFieldStyle}
            >
              <option value="">Sélectionner un compte</option>
              {igAccounts.map((a: { page_id: string; username?: string | null; page_name?: string | null }) => (
                <option key={a.page_id} value={a.page_id}>
                  @{a.username || "instagram"} — {a.page_name || a.page_id}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={`${styles.actionBtn} ${instagramConnected ? styles.disconnectBtn : styles.connectBtn}`}
              onClick={instagramConnected ? handleProfileDisconnect : handleProfileConnect}
              disabled={!igSelectedPageId || instagramProfileBusy}
              style={{ width: "100%" }}
            >
              {instagramProfileBusy ? (instagramProfileAction === "disconnect" ? "Déconnexion..." : "Connexion...") : (instagramConnected ? "Déconnecter le compte" : "Connecter")}
            </button>
          </div>

          {instagramProfileBusy ? (
            <StatusMessage variant="success">
              {instagramProfileAction === "disconnect" ? "Déconnexion en cours..." : "Connexion en cours..."}
            </StatusMessage>
          ) : null}
          {displayAccountsError && <StatusMessage variant="error">{displayAccountsError}</StatusMessage>}
        </div>
      ) : null}

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
          <div className={styles.blockTitle}>Lien du compte</div>
          <ConnectionPill connected={instagramConnected && !!instagramUrl?.trim()} />
        </div>
        <div className={styles.blockSub}>Se remplit automatiquement après sélection.</div>

        <div style={responsiveActionsRow}>
          <input
            value={instagramUrl}
            readOnly
            placeholder={instagramConnected ? "Lien récupéré automatiquement" : "Sélectionne un compte pour générer le lien"}
            style={{
              ...singleFieldStyle,
              opacity: instagramUrl ? 1 : 0.8,
            }}
          />

          <a
            href={instagramUrl || "#"}
            target="_blank"
            rel="noreferrer"
            className={`${styles.actionBtn} ${styles.viewBtn}`}
            style={{ pointerEvents: instagramUrl ? "auto" : "none", opacity: instagramUrl ? 1 : 0.5, width: "100%" }}
          >
            Voir le compte
          </a>
        </div>

        {instagramUrlNotice && <StatusMessage variant="success">{instagramUrlNotice}</StatusMessage>}
        {instagramUrlError && <StatusMessage variant="error">{instagramUrlError}</StatusMessage>}
      </div>
    </div>
  );
}
