"use client";

import styles from "../dashboard.module.css";
import ConnectionPill from "./ConnectionPill";
import StatusMessage from "./StatusMessage";

const cardStyle = {
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.03)",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 10,
} as const;

const inputStyle = {
  flex: "1 1 260px",
  minWidth: 0,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(15,23,42,0.65)",
  colorScheme: "dark",
  padding: "10px 12px",
  color: "white",
  outline: "none",
} as const;

export default function LinkedinPanel(props: any) {
  const {
    linkedinConnected,
    linkedinAccountConnected,
    linkedinConnectionStatus,
    linkedinDisplayName,
    connectLinkedinAccount,
    disconnectLinkedinAccount,
    linkedinUrl,
    setLinkedinUrl,
    saveLinkedinProfileUrl,
    linkedinUrlNotice,
    linkedinUrlError,
    setLinkedinUrlNotice,
    linkedinAccountBusy,
    linkedinUrlBusy,
    linkedinOrganizations = [],
    linkedinOrganizationsLoading,
    linkedinSelectedOrganizationId,
    linkedinSelectedOrganizationName,
    loadLinkedinOrganizations,
    selectLinkedinOrganization,
    useLinkedinPersonalProfile,
  } = props;

  const hasCompanyPage = !!linkedinSelectedOrganizationId || !!linkedinSelectedOrganizationName;
  const profileReady = !!linkedinAccountConnected;
  const linkedinNeedsUpdate = linkedinConnectionStatus === "needs_update" && (linkedinConnected || linkedinAccountConnected);
  const linkedinStatusLabel = linkedinNeedsUpdate ? "À actualiser" : hasCompanyPage ? "Profil + page connectés" : profileReady ? "Profil connecté" : "À connecter";
  const linkedinStatusDot = linkedinNeedsUpdate
    ? "rgba(245,158,11,0.95)"
    : profileReady
      ? "rgba(34,197,94,0.95)"
      : "rgba(148,163,184,0.9)";

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
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: linkedinStatusDot }} />
          Statut : <strong>{linkedinStatusLabel}</strong>
        </span>
      </div>

      {!profileReady ? (
        <div style={cardStyle}>
          <div className={styles.blockTitle}>Choisissez le type de connexion</div>
          <div className={styles.blockSub}>
            La connexion LinkedIn permet l’analyse des statistiques et la gestion des publications.
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.connectBtn}`}
              onClick={connectLinkedinAccount}
              style={{ justifyContent: "center", padding: "8px 16px", width: "auto" }}
            >
              Profil personnel
            </button>

            <button
              type="button"
              className={`${styles.actionBtn} ${styles.connectBtn}`}
              onClick={connectLinkedinAccount}
              style={{ justifyContent: "center", padding: "8px 16px", width: "auto" }}
            >
              Page entreprise
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={cardStyle}>
            <div className={styles.blockHeaderRow}>
              <div className={styles.blockTitle}>Profil personnel LinkedIn</div>
              <ConnectionPill connected={profileReady && !hasCompanyPage} status={linkedinNeedsUpdate ? "needs_update" : undefined} />
            </div>
            <div className={styles.blockSub}>
              {hasCompanyPage
                ? "Profil utilisé pour autoriser la page entreprise LinkedIn."
                : "Canal actif : publication et données exploitées depuis le profil personnel."}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input value={linkedinDisplayName} readOnly placeholder="Profil connecté" style={{ ...inputStyle, opacity: 1 }} />

              {hasCompanyPage ? (
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.connectBtn}`}
                  onClick={() => void useLinkedinPersonalProfile?.()}
                  disabled={linkedinAccountBusy}
                >
                  Utiliser ce profil
                </button>
              ) : null}

              {linkedinNeedsUpdate ? (
                <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={connectLinkedinAccount} disabled={linkedinAccountBusy}>
                  Actualiser
                </button>
              ) : null}

              <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={() => void disconnectLinkedinAccount()} disabled={linkedinAccountBusy}>
                {linkedinAccountBusy ? "Déconnexion..." : "Déconnecter"}
              </button>
            </div>
          </div>

          <div style={cardStyle}>
            <div className={styles.blockHeaderRow}>
              <div className={styles.blockTitle}>Page entreprise LinkedIn</div>
              <ConnectionPill connected={hasCompanyPage} />
            </div>
            <div className={styles.blockSub}>
              {hasCompanyPage
                ? "Canal actif : publication et données exploitées depuis la page entreprise."
                : "Optionnel : connecter une page administrée par le profil LinkedIn."}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  value={linkedinSelectedOrganizationName || ""}
                  readOnly
                  placeholder="Aucune page entreprise connectée"
                  style={{ ...inputStyle, opacity: linkedinSelectedOrganizationName ? 1 : 0.8 }}
                />

                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.connectBtn}`}
                  onClick={() => void loadLinkedinOrganizations?.()}
                  disabled={linkedinOrganizationsLoading}
                >
                  {linkedinOrganizationsLoading ? "Recherche..." : hasCompanyPage ? "Changer de page" : "Connecter une page"}
                </button>
              </div>

              {linkedinOrganizations.length > 0 ? (
                <select
                  value={linkedinSelectedOrganizationId || ""}
                  onChange={(event) => void selectLinkedinOrganization?.(event.target.value)}
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(15,23,42,0.95)",
                    colorScheme: "dark",
                    padding: "10px 12px",
                    color: "white",
                    outline: "none",
                  }}
                >
                  <option value="">Choisir une page entreprise</option>
                  {linkedinOrganizations.map((org: any) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>
        </>
      )}

      <div style={cardStyle}>
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Lien public LinkedIn</div>
          <ConnectionPill connected={!!linkedinUrl?.trim()} />
        </div>
        <div className={styles.blockSub}>Optionnel : utile pour le bouton Voir dans le tableau de bord.</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={linkedinUrl}
            onChange={(e) => {
              setLinkedinUrlNotice(null);
              setLinkedinUrl(e.target.value);
            }}
            placeholder="Lien LinkedIn (optionnel)"
            style={{ ...inputStyle, opacity: linkedinUrl ? 1 : 0.8 }}
          />

          <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={() => void saveLinkedinProfileUrl()} disabled={linkedinUrlBusy}>
            {linkedinUrlBusy ? "Enregistrement..." : "Enregistrer"}
          </button>

          <a
            href={linkedinUrl || "#"}
            target="_blank"
            rel="noreferrer"
            className={`${styles.actionBtn} ${styles.viewBtn}`}
            style={{ pointerEvents: linkedinUrl ? "auto" : "none", opacity: linkedinUrl ? 1 : 0.5 }}
          >
            Voir
          </a>
        </div>

        {linkedinUrlNotice && <StatusMessage variant="success">{linkedinUrlNotice}</StatusMessage>}
        {linkedinUrlError && <StatusMessage variant="error">{linkedinUrlError}</StatusMessage>}
      </div>
    </div>
  );
}
