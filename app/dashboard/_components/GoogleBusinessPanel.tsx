"use client";

import { useMemo } from "react";
import styles from "../dashboard.module.css";
import ConnectionPill from "./ConnectionPill";
import StatusMessage from "./StatusMessage";

export default function GoogleBusinessPanel(props: any) {
  const {
    gmbConnected,
    gmbAccountConnected,
    gmbAccountEmail,
    connectGmbAccount,
    disconnectGmbAccount,
    gmbConfigured,
    gmbAccountName,
    gmbAccounts,
    gmbLoadingList,
    loadGmbAccountsAndLocations,
    gmbLocationName,
    gmbLocationLabel,
    setGmbLocationName,
    gmbLocations,
    saveGmbLocation,
    gmbListError,
    gmbUrl,
    gmbUrlNotice,
    gmbUrlError,
    disconnectGmbBusiness,
    gmbAccountBusy,
    gmbLocationBusy,
    gmbLocationAction,
  } = props;

  const hasSelectedLocationInList = Boolean(
    gmbLocationName && gmbLocations.some((l: { name: string; title?: string | null }) => l.name === gmbLocationName)
  );

  const selectedLocationLabel = useMemo(() => {
    const picked = gmbLocations.find((l: { name: string; title?: string | null }) => l.name === gmbLocationName);
    return String(picked?.title || gmbLocationLabel || gmbUrl || gmbLocationName || "").trim();
  }, [gmbLocations, gmbLocationName, gmbLocationLabel, gmbUrl]);

  const handleLocationConnect = () => {
    void saveGmbLocation();
  };

  const handleLocationDisconnect = () => {
    void disconnectGmbBusiness();
  };

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
              background: gmbConnected
                ? "rgba(34,197,94,0.95)"
                : gmbAccountConnected
                  ? "rgba(59,130,246,0.95)"
                  : "rgba(148,163,184,0.9)",
            }}
          />
          Statut : <strong>{gmbConnected ? "Connecté" : gmbAccountConnected ? "Compte connecté" : "À connecter"}</strong>
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
          <ConnectionPill connected={gmbAccountConnected} />
        </div>
        <div className={styles.blockSub}>Ce compte Google sert à accéder à vos établissements Google Business.</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={gmbAccountEmail || (gmbAccountConnected ? "Compte connecté" : "")}
            readOnly
            placeholder={gmbAccountConnected ? "Compte connecté" : "Aucun compte connecté"}
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
              opacity: gmbAccountConnected ? 1 : 0.8,
            }}
          />

          {gmbAccountConnected ? (
            <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={() => void disconnectGmbAccount()} disabled={gmbAccountBusy}>
              {gmbAccountBusy ? "Déconnexion..." : "Déconnexion"}
            </button>
          ) : (
            <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={connectGmbAccount}>
              Connecter Google
            </button>
          )}
        </div>
      </div>

      {gmbAccountConnected ? (
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
            <div className={styles.blockTitle}>Établissement à connecter</div>
            <ConnectionPill connected={gmbConfigured} />
          </div>
          <div className={styles.blockSub}>Choisissez la fiche Google Business à relier à iNrCy.</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.secondaryBtn}`}
              onClick={() => loadGmbAccountsAndLocations()}
              disabled={gmbLoadingList || gmbLocationBusy}
            >
              {gmbLoadingList ? "Chargement..." : "Charger mes établissements"}
            </button>

            <select
              value={gmbLocationName}
              onChange={(e) => setGmbLocationName(e.target.value)}
              disabled={gmbLocationBusy}
              style={{
                flex: "1 1 260px",
                minWidth: 220,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(15,23,42,0.65)",
                colorScheme: "dark",
                padding: "10px 12px",
                color: "white",
                outline: "none",
              }}
            >
              <option value="">Sélectionner un établissement</option>
              {!hasSelectedLocationInList && gmbLocationName ? <option value={gmbLocationName}>{selectedLocationLabel}</option> : null}
              {gmbLocations.map((l: { name: string; title?: string | null }) => (
                <option key={l.name} value={l.name}>
                  {l.title || l.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={`${styles.actionBtn} ${gmbConfigured ? styles.disconnectBtn : styles.connectBtn}`}
              onClick={gmbConfigured ? handleLocationDisconnect : handleLocationConnect}
              disabled={!gmbLocationName || gmbLocationBusy}
            >
              {gmbLocationBusy ? (gmbLocationAction === "disconnect" ? "Déconnexion..." : "Connexion...") : (gmbConfigured ? "Déconnecter l'établissement" : "Connecter l'établissement")}
            </button>
          </div>

          {gmbAccounts?.length > 1 ? (
            <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: -2 }}>
              Plusieurs comptes détectés : iNrCy utilise actuellement <strong>{gmbAccountName || "(non défini)"}</strong>.
            </div>
          ) : null}

          {gmbLocationBusy ? (
            <StatusMessage variant="success">
              {gmbLocationAction === "disconnect" ? "Déconnexion en cours..." : "Connexion en cours..."}
            </StatusMessage>
          ) : null}

          {gmbListError && <StatusMessage variant="error">{gmbListError}</StatusMessage>}
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
          <div className={styles.blockTitle}>Lien de la page</div>
          <ConnectionPill connected={gmbConfigured && !!gmbUrl?.trim()} />
        </div>
        <div className={styles.blockSub}>Se remplit automatiquement une fois l'établissement sélectionné.</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={gmbUrl}
            readOnly
            placeholder={gmbConfigured ? "Lien récupéré automatiquement" : "Sélectionne un établissement pour générer le lien"}
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
              opacity: gmbUrl ? 1 : 0.8,
            }}
          />

          <a
            href={gmbUrl || "#"}
            target="_blank"
            rel="noreferrer"
            className={`${styles.actionBtn} ${styles.viewBtn}`}
            style={{ pointerEvents: gmbUrl ? "auto" : "none", opacity: gmbUrl ? 1 : 0.5 }}
          >
            Voir la page
          </a>
        </div>

        {gmbUrlNotice && <StatusMessage variant="success">{gmbUrlNotice}</StatusMessage>}
        {gmbUrlError && <StatusMessage variant="error">{gmbUrlError}</StatusMessage>}
      </div>
    </div>
  );
}
