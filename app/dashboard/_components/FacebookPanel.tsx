"use client";

import { useEffect, useState } from "react";
import styles from "../dashboard.module.css";
import ConnectionPill from "./ConnectionPill";
import StatusMessage from "./StatusMessage";

export default function FacebookPanel(props: any) {
  const {
    facebookPageConnected,
    facebookAccountConnected,
    facebookConnectionStatus,
    facebookAccountEmail,
    connectFacebookAccount,
    connectFacebookBusinessAccount,
    disconnectFacebookAccount,
    fbPagesLoading,
    fbPagesPhase = "idle",
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
    disconnectFacebookPage,
    facebookAccountBusy,
    facebookPageBusy,
    facebookPageAction,
  } = props;

  const facebookNeedsUpdate = facebookConnectionStatus === "needs_update" && (facebookPageConnected || facebookAccountConnected);
  const facebookStatusLabel = facebookNeedsUpdate ? "À actualiser" : facebookPageConnected ? "Connecté" : facebookAccountConnected ? "Compte connecté" : "À connecter";
  const facebookStatusDot = facebookNeedsUpdate
    ? "rgba(245,158,11,0.95)"
    : facebookPageConnected
      ? "rgba(34,197,94,0.95)"
      : facebookAccountConnected
        ? "rgba(59,130,246,0.95)"
        : "rgba(148,163,184,0.9)";
  const facebookPageActivity =
    facebookPageBusy && facebookPageAction === "disconnect"
      ? "disconnecting"
      : facebookPageBusy || fbPagesPhase === "connecting"
        ? "connecting"
        : fbPagesPhase === "searching" || fbPagesLoading
          ? "searching"
          : undefined;
  const facebookPageActivityLabel =
    facebookPageActivity === "searching"
      ? "Recherche des pages…"
      : facebookPageActivity === "disconnecting"
        ? "Déconnexion en cours…"
        : facebookPageActivity === "connecting"
          ? "Connexion en cours…"
          : undefined;

  const [facebookPagePickerUnlocked, setFacebookPagePickerUnlocked] = useState(!facebookPageConnected);
  const [facebookConnectedPageId, setFacebookConnectedPageId] = useState("");
  const [facebookConnectedPageLabel, setFacebookConnectedPageLabel] = useState("");

  useEffect(() => {
    if (!facebookPageConnected) {
      setFacebookPagePickerUnlocked(true);
      setFacebookConnectedPageId("");
      setFacebookConnectedPageLabel("");
      return;
    }

    if (!facebookPagePickerUnlocked && !facebookPageBusy && fbSelectedPageId) {
      setFacebookConnectedPageId(fbSelectedPageId);
      setFacebookConnectedPageLabel((fbSelectedPageName || "").trim());
    }
  }, [facebookPageConnected, facebookPagePickerUnlocked, facebookPageBusy, fbSelectedPageId, fbSelectedPageName]);

  const facebookPagePickerLocked = facebookPageConnected && !facebookPagePickerUnlocked;
  const selectedPageValue = fbSelectedPageId || facebookConnectedPageId;
  const hasSelectedPageInList = Boolean(
    selectedPageValue && fbPages.some((p: { id: string; name?: string | null }) => p.id === selectedPageValue)
  );
  const selectedPageLabel = (fbSelectedPageName || facebookConnectedPageLabel || facebookUrl || selectedPageValue || "").trim();
  const canConnectFacebookPage = Boolean(selectedPageValue) && !fbPagesLoading && !facebookPageBusy;
  const canChangeFacebookPage = Boolean(selectedPageValue) && selectedPageValue !== facebookConnectedPageId && !fbPagesLoading && !facebookPageBusy;

  const startStandard = () => {
    connectFacebookAccount();
  };

  const startBusiness = () => {
    connectFacebookBusinessAccount();
  };

  const disconnectAll = () => {
    void disconnectFacebookAccount();
  };

  const handlePageConnect = async () => {
    const saved = await saveFacebookPage();
    if (saved) setFacebookPagePickerUnlocked(false);
  };

  const handlePageDisconnect = async () => {
    await disconnectFacebookPage();
    setFacebookPagePickerUnlocked(true);
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
              background: facebookStatusDot,
            }}
          />
          Statut : <strong>{facebookStatusLabel}</strong>
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
          <ConnectionPill connected={facebookAccountConnected} status={facebookNeedsUpdate ? "needs_update" : undefined} />
        </div>
        <div className={styles.blockSub}>Ce compte Facebook peut cumuler un accès standard et un accès via portefeuille business.</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={facebookAccountEmail}
            readOnly
            placeholder={facebookAccountConnected ? "Compte connecté" : "Aucun compte connecté"}
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
              opacity: facebookAccountConnected ? 1 : 0.8,
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {facebookAccountConnected ? (
            <>
              {facebookNeedsUpdate ? (
                <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={startStandard} disabled={facebookAccountBusy}>
                  Actualiser
                </button>
              ) : null}
              <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnectAll} disabled={facebookAccountBusy}>
                {facebookAccountBusy ? "Déconnexion..." : "Déconnexion"}
              </button>
            </>
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
            <ConnectionPill
              connected={facebookPageConnected}
              status={facebookNeedsUpdate ? "needs_update" : undefined}
              activity={facebookPageActivity}
              label={facebookPageActivityLabel}
            />
          </div>
          <div className={styles.blockSub}>Choisissez la page Facebook à analyser (et éventuellement publier).</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.secondaryBtn} ${fbPagesPhase === "connecting" ? styles.connectingActionBtn : fbPagesPhase === "searching" || fbPagesLoading ? styles.searchingActionBtn : ""}`}
              onClick={() => {
                setFacebookPagePickerUnlocked(true);
                loadFacebookPages();
              }}
              disabled={fbPagesLoading || facebookPageBusy}
            >
              Charger mes pages
            </button>

            <select
              value={selectedPageValue}
              onChange={(e) => setFbSelectedPageId(e.target.value)}
              disabled={fbPagesLoading || facebookPageBusy || facebookPagePickerLocked}
              style={{
                flex: "1 1 260px",
                minWidth: 0,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(15,23,42,0.65)",
                colorScheme: "dark",
                padding: "10px 12px",
                color: "white",
                outline: "none",
                opacity: facebookPagePickerLocked ? 0.88 : 1,
                cursor: facebookPagePickerLocked ? "not-allowed" : "pointer",
              }}
            >
              <option value="">Sélectionner une page</option>
              {!hasSelectedPageInList && selectedPageValue ? <option value={selectedPageValue}>{selectedPageLabel}</option> : null}
              {fbPages.map((p: { id: string; name?: string | null }) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.id}
                </option>
              ))}
            </select>

            {facebookPageConnected ? (
              <>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.connectBtn} ${facebookPageBusy && facebookPageAction === "connect" ? styles.connectingActionBtn : ""}`}
                  onClick={() => void handlePageConnect()}
                  disabled={!canChangeFacebookPage}
                >
                  Changer de page
                </button>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.disconnectBtn} ${facebookPageBusy && facebookPageAction === "disconnect" ? styles.connectingActionBtn : ""}`}
                  onClick={() => void handlePageDisconnect()}
                  disabled={fbPagesLoading || facebookPageBusy}
                >
                  Déconnecter la page
                </button>
              </>
            ) : (
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.connectBtn} ${facebookPageBusy && facebookPageAction === "connect" ? styles.connectingActionBtn : ""}`}
                onClick={() => void handlePageConnect()}
                disabled={!canConnectFacebookPage}
              >
                Connecter la page
              </button>
            )}
          </div>

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
              minWidth: 0,
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
