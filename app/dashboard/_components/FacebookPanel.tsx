"use client";

import { useEffect, useState } from "react";
import styles from "../dashboard.module.css";
import ConnectionPill from "./ConnectionPill";
import StatusMessage from "./StatusMessage";

export default function FacebookPanel(props: any) {
  const {
    facebookPageConnected,
    facebookAccountConnected,
    facebookAccountEmail,
    connectFacebookAccount,
    connectFacebookBusinessAccount,
    disconnectFacebookAccount,
    fbPagesLoading,
    loadFacebookPages,
    fbSelectedPageId,
    fbSelectedPageName,
    setFbSelectedPageId,
    fbPages,
    saveFacebookPage,
    fbPagesError,
    facebookUrl,
    facebookUrlNotice,
    facebookUrlError,
    disconnectFacebookPage
  } = props;

  const [pendingMode, setPendingMode] = useState<null | "standard" | "business" | "disconnect">(null);

  useEffect(() => {
    if ((pendingMode === "standard" || pendingMode === "business") && facebookAccountConnected) {
      setPendingMode(null);
      return;
    }
    if (pendingMode === "disconnect" && !facebookAccountConnected && !facebookPageConnected) {
      setPendingMode(null);
    }
  }, [pendingMode, facebookAccountConnected, facebookPageConnected]);

  const hasSelectedPageInList = Boolean(
    fbSelectedPageId && fbPages.some((p: { id: string; name?: string | null }) => p.id === fbSelectedPageId)
  );
  const selectedPageLabel = (fbSelectedPageName || facebookUrl || fbSelectedPageId || "").trim();

  const startStandard = () => {
    setPendingMode("standard");
    connectFacebookAccount();
  };

  const startBusiness = () => {
    setPendingMode("business");
    connectFacebookBusinessAccount();
  };

  const disconnectAll = () => {
    setPendingMode("disconnect");
    disconnectFacebookAccount();
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
              background: facebookPageConnected
                ? "rgba(34,197,94,0.95)"
                : facebookAccountConnected
                  ? "rgba(59,130,246,0.95)"
                  : "rgba(148,163,184,0.9)",
            }}
          />
          Statut : <strong>{facebookPageConnected ? "Connecté" : facebookAccountConnected ? "Compte connecté" : "À connecter"}</strong>
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
          <ConnectionPill connected={facebookAccountConnected} />
        </div>
        <div className={styles.blockSub}>Ce compte Facebook peut cumuler un accès standard et un accès via portefeuille business.</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={facebookAccountEmail}
            readOnly
            placeholder={facebookAccountConnected ? "Compte connecté" : "Aucun compte connecté"}
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
              opacity: facebookAccountConnected ? 1 : 0.8,
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {facebookAccountConnected ? (
            <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnectAll}>
              Déconnexion
            </button>
          ) : (
            <>
              <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={startStandard}>
                Connexion standard
              </button>
              <button type="button" className={`${styles.actionBtn} ${styles.secondaryBtn}`} onClick={startBusiness}>
                Connexion business
              </button>
            </>
          )}
        </div>
      </div>

      {facebookAccountConnected ? (
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
            <div className={styles.blockTitle}>Page à connecter</div>
            <ConnectionPill connected={facebookPageConnected} />
          </div>
          <div className={styles.blockSub}>Choisissez la page Facebook à analyser (et éventuellement publier).</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.secondaryBtn}`}
              onClick={() => loadFacebookPages()}
              disabled={fbPagesLoading}
            >
              {fbPagesLoading ? "Chargement..." : "Charger mes pages"}
            </button>

            <select
              value={fbSelectedPageId}
              onChange={(e) => setFbSelectedPageId(e.target.value)}
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
              <option value="">Sélectionner une page</option>
              {!hasSelectedPageInList && fbSelectedPageId ? <option value={fbSelectedPageId}>{selectedPageLabel}</option> : null}
              {fbPages.map((p: { id: string; name?: string | null }) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.id}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={`${styles.actionBtn} ${facebookPageConnected ? styles.disconnectBtn : styles.connectBtn}`}
              onClick={facebookPageConnected ? disconnectFacebookPage : saveFacebookPage}
              disabled={!fbSelectedPageId}
            >
              {facebookPageConnected ? "Déconnecter la page" : "Connecter la page"}
            </button>
          </div>

          {pendingMode ? (
            <StatusMessage variant="success">
              {pendingMode === "disconnect" ? "Déconnexion en cours..." : "Connexion en cours..."}
            </StatusMessage>
          ) : null}
          {fbPagesError && <StatusMessage variant="error">{fbPagesError}</StatusMessage>}
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
          <ConnectionPill connected={facebookPageConnected && !!facebookUrl?.trim()} />
        </div>
        <div className={styles.blockSub}>Se remplit automatiquement une fois la page choisie.</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={facebookUrl}
            readOnly
            placeholder={facebookPageConnected ? "Lien récupéré automatiquement" : "Sélectionne une page pour générer le lien"}
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
              opacity: facebookUrl ? 1 : 0.8,
            }}
          />

          <a
            href={facebookUrl || "#"}
            target="_blank"
            rel="noreferrer"
            className={`${styles.actionBtn} ${styles.viewBtn}`}
            style={{ pointerEvents: facebookUrl ? "auto" : "none", opacity: facebookUrl ? 1 : 0.5 }}
          >
            Voir la page
          </a>
        </div>
        {facebookUrlNotice && <StatusMessage variant="success">{facebookUrlNotice}</StatusMessage>}
        {facebookUrlError && <StatusMessage variant="error">{facebookUrlError}</StatusMessage>}
      </div>
    </div>
  );
}
