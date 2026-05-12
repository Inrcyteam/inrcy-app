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
    linkedinAccountConnected,
    linkedinConnectionStatus,
    linkedinDisplayName,
    connectLinkedinAccount,
    connectLinkedinBusinessAccount,
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
    linkedinOrganizationPickerOpen,
    loadLinkedinOrganizations,
    selectLinkedinOrganization,
  } = props;

  const hasCompanyPage = !!linkedinSelectedOrganizationId || !!linkedinSelectedOrganizationName;
  const profileReady = !!linkedinAccountConnected;
  const linkedinNeedsUpdate = linkedinConnectionStatus === "needs_update" && linkedinAccountConnected;
  const linkedinStatusLabel = linkedinNeedsUpdate ? "À actualiser" : hasCompanyPage ? "Profil + page connectés" : profileReady ? "Profil connecté" : "À connecter";
  const linkedinStatusDot = linkedinNeedsUpdate
    ? "rgba(245,158,11,0.95)"
    : profileReady
      ? "rgba(34,197,94,0.95)"
      : "rgba(148,163,184,0.9)";

  const linkBlockTitle = hasCompanyPage ? "Lien page entreprise LinkedIn" : "Lien profil personnel LinkedIn";
  const linkBlockHelp = hasCompanyPage
    ? "Lien public de la page entreprise utilisée dans iNrStats et dans le bouton Voir."
    : "Lien public du profil personnel utilisé dans iNrStats et dans le bouton Voir.";
  const linkPlaceholder = hasCompanyPage ? "Lien de la page entreprise LinkedIn" : "Lien du profil LinkedIn";

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
              onClick={() => void connectLinkedinAccount?.("profile")}
              style={{ justifyContent: "center", padding: "8px 16px", width: "auto" }}
            >
              Profil personnel
            </button>

            <button
              type="button"
              className={`${styles.actionBtn} ${styles.connectBtn}`}
              onClick={() => void connectLinkedinBusinessAccount?.()}
              style={{ justifyContent: "center", padding: "8px 16px", width: "auto" }}
            >
              Page entreprise
            </button>
          </div>
        </div>
      ) : (
        <div style={cardStyle}>
          <div className={styles.blockHeaderRow}>
            <div className={styles.blockTitle}>Profil personnel LinkedIn</div>
            <ConnectionPill connected={profileReady} status={linkedinNeedsUpdate ? "needs_update" : undefined} />
          </div>
          <div className={styles.blockSub}>
            {hasCompanyPage
              ? "Profil connecté pour autoriser et piloter la page entreprise LinkedIn."
              : "Canal actif : publication et données exploitées depuis le profil personnel."}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input value={linkedinDisplayName} readOnly placeholder="Profil connecté" style={{ ...inputStyle, opacity: 1 }} />

            {linkedinNeedsUpdate ? (
              <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={() => void connectLinkedinAccount?.("profile")} disabled={linkedinAccountBusy}>
                Actualiser
              </button>
            ) : null}

            <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={() => void disconnectLinkedinAccount()} disabled={linkedinAccountBusy}>
              {linkedinAccountBusy ? "Déconnexion..." : "Déconnecter"}
            </button>
          </div>
        </div>
      )}

      {profileReady ? (
        <div style={cardStyle}>
          <div className={styles.blockHeaderRow}>
            <div className={styles.blockTitle}>{hasCompanyPage ? "Page entreprise LinkedIn" : "Connecter une page entreprise"}</div>
            <ConnectionPill connected={hasCompanyPage} />
          </div>
          <div className={styles.blockSub}>
            {hasCompanyPage
              ? "Canal actif : publication et données exploitées depuis la page entreprise."
              : "Sélectionnez la page entreprise à connecter. Si une seule page est disponible, elle sera connectée automatiquement."}
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
                onClick={() => void loadLinkedinOrganizations?.({ resetSelection: true })}
                disabled={linkedinOrganizationsLoading}
              >
                {linkedinOrganizationsLoading ? "Chargement..." : hasCompanyPage ? "Charger les pages" : "Connecter une page"}
              </button>
            </div>

            {linkedinOrganizationPickerOpen && linkedinOrganizations.length > 1 ? (
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
                <option value="">Sélectionner la page entreprise</option>
                {linkedinOrganizations.map((org: any) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      ) : null}

      <div style={cardStyle}>
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>{linkBlockTitle}</div>
          <ConnectionPill connected={!!linkedinUrl?.trim()} />
        </div>
        <div className={styles.blockSub}>{linkBlockHelp}</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={linkedinUrl}
            onChange={(e) => {
              setLinkedinUrlNotice(null);
              setLinkedinUrl(e.target.value);
            }}
            placeholder={linkPlaceholder}
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
