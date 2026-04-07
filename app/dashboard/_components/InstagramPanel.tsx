"use client";

import { useEffect, useState } from "react";
import styles from "../dashboard.module.css";
import ConnectionPill from "./ConnectionPill";
import StatusMessage from "./StatusMessage";

export default function InstagramPanel(props: any) {
  const {
    instagramConnected,
    instagramAccountConnected,
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
    disconnectInstagramProfile
  } = props;

  const [pendingMode, setPendingMode] = useState<null | "standard" | "business" | "disconnect">(null);

  useEffect(() => {
    if ((pendingMode === "standard" || pendingMode === "business") && instagramAccountConnected) {
      setPendingMode(null);
      return;
    }
    if (pendingMode === "disconnect" && !instagramAccountConnected && !instagramConnected) {
      setPendingMode(null);
    }
  }, [pendingMode, instagramAccountConnected, instagramConnected]);

  const startStandard = () => {
    setPendingMode("standard");
    connectInstagramAccount();
  };

  const startBusiness = () => {
    setPendingMode("business");
    connectInstagramBusinessAccount();
  };

  const disconnectAll = () => {
    setPendingMode("disconnect");
    disconnectInstagramAccount();
  };

  const displayAccountsError = !instagramConnected && !instagramAccountConnected ? null : igAccountsError;

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
              background: instagramConnected
                ? "rgba(34,197,94,0.95)"
                : instagramAccountConnected
                  ? "rgba(59,130,246,0.95)"
                  : "rgba(148,163,184,0.9)",
            }}
          />
          Statut : <strong>{instagramConnected ? "Connecté" : instagramAccountConnected ? "Compte connecté" : "À connecter"}</strong>
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
          <ConnectionPill connected={instagramAccountConnected} />
        </div>
        <div className={styles.blockSub}>
          Instagram nécessite un compte <strong>Business / Creator</strong> relié à une Page Facebook.
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={instagramUsername}
            readOnly
            placeholder={instagramAccountConnected ? "Compte connecté" : "Aucun compte connecté"}
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
              opacity: instagramAccountConnected ? 1 : 0.8,
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {instagramAccountConnected ? (
            <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnectAll}>
              Déconnexion
            </button>
          ) : (
            <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={startStandard}>
              Connexion
            </button>
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
            <ConnectionPill connected={instagramConnected} />
          </div>
          <div className={styles.blockSub}>On liste les Pages Facebook qui possèdent un Instagram Business/Creator.</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.secondaryBtn}`}
              onClick={() => loadInstagramAccounts()}
              disabled={igAccountsLoading}
            >
              {igAccountsLoading ? "Chargement..." : "Charger mes comptes"}
            </button>

            <select
              value={igSelectedPageId}
              onChange={(e) => setIgSelectedPageId(e.target.value)}
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
              onClick={instagramConnected ? disconnectInstagramProfile : saveInstagramProfile}
              disabled={!igSelectedPageId}
            >
              {instagramConnected ? "Déconnecter le compte" : "Connecter"}
            </button>
          </div>

          {pendingMode ? (
            <StatusMessage variant="success">
              {pendingMode === "disconnect" ? "Déconnexion en cours..." : "Connexion en cours..."}
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

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={instagramUrl}
            readOnly
            placeholder={instagramConnected ? "Lien récupéré automatiquement" : "Sélectionne un compte pour générer le lien"}
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
              opacity: instagramUrl ? 1 : 0.8,
            }}
          />

          <a
            href={instagramUrl || "#"}
            target="_blank"
            rel="noreferrer"
            className={`${styles.actionBtn} ${styles.viewBtn}`}
            style={{ pointerEvents: instagramUrl ? "auto" : "none", opacity: instagramUrl ? 1 : 0.5 }}
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
