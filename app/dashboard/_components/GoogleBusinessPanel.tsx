"use client";

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
    setGmbLocationName,
    gmbLocations,
    saveGmbLocation,
    gmbListError,
    gmbUrl,
    gmbUrlNotice,
    gmbUrlError,
    disconnectGmbBusiness
  } = props;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Statut */}
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
              background: gmbConnected ? "rgba(34,197,94,0.95)" : "rgba(148,163,184,0.9)",
            }}
          />
          Statut : <strong>{!gmbAccountConnected ? "À connecter" : gmbConfigured ? "Google Business connecté" : "Compte connecté"}</strong>
        </span>
      </div>

      {/* Compte Google connecté */}
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
            placeholder="(aucun compte connecté)"
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
              opacity: gmbAccountConnected ? 1 : 0.7,
            }}
          />

          {!gmbAccountConnected ? (
            <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={connectGmbAccount}>
              Connecter Google
            </button>
          ) : (
            <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnectGmbAccount}>
              Déconnecter Google
            </button>
          )}
        </div>
      </div>


      {/* Sélection de l'établissement (requis pour publier) */}
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
            <div className={styles.blockTitle}>Établissement à publier</div>
            <ConnectionPill connected={!!gmbLocationName} />
          </div>
          <div className={styles.blockSub}>Choisis la fiche Google Business sur laquelle iNrCy publie.</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.secondaryBtn}`}
              onClick={() => loadGmbAccountsAndLocations()}
              disabled={gmbLoadingList}
            >
              {gmbLoadingList ? "Chargement..." : "Charger mes établissements"}
            </button>

            {/*
              Le compte Google est déjà identifié au-dessus (bloc "Compte connecté").
              Ici on ne garde que le choix de la fiche (location).
              Si plusieurs comptes sont disponibles, l'API renvoie un compte par défaut (souvent le premier).
            */}
            {gmbAccounts?.length > 1 ? (
              <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, marginLeft: 2 }}>
                Plusieurs comptes détectés : iNrCy utilise par défaut <strong>{gmbAccountName || "(non défini)"}</strong>.
              </div>
            ) : null}

            <select
              value={gmbLocationName}
              onChange={(e) => setGmbLocationName(e.target.value)}
              style={{
                flex: "1 1 320px",
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
              <option value="">Fiche (location)</option>
              {gmbLocations.map((l: { name: string; title?: string | null }) => (
                <option key={l.name} value={l.name}>
                  {l.title || l.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={`${styles.actionBtn} ${styles.connectBtn}`}
              onClick={saveGmbLocation}
              disabled={!gmbAccountName || !gmbLocationName}
            >
              Connecter Google Business
            </button>
          </div>
          {gmbListError && (
            <div style={{ color: "rgba(248,113,113,0.95)", fontSize: 13, lineHeight: 1.3 }}>
              {gmbListError}
              <div style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>
                Astuce : si le message parle d’API non activée, active <strong>Business Profile Business Information API</strong> dans Google Cloud.
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Lien de la page (auto) */}
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
            <div className={styles.blockTitle}>Lien de la page</div>
            <ConnectionPill connected={!!gmbUrl?.trim() && gmbConfigured} />
          </div>
          <div className={styles.blockSub}>
            Se remplit automatiquement une fois l’<strong>établissement</strong> choisi.
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={gmbUrl}
              readOnly
              placeholder="(sélectionne une fiche pour générer le lien)"
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
                opacity: gmbUrl ? 1 : 0.75,
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
      ) : null}

      {/* Bloc 3 — Déconnexion Google Business (ne déconnecte pas le compte Google) */}
      {gmbAccountConnected && gmbConfigured ? (
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnectGmbBusiness}>
            Déconnecter Google Business
          </button>
        </div>
      ) : null}
    </div>
  );
}
