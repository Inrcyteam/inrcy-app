"use client";

import { useEffect, useMemo, useState } from "react";

export type TiktokPrivacyLevel =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "FOLLOWER_OF_CREATOR"
  | "SELF_ONLY"
  | string;

export type TiktokCommercialContent = "none" | "self" | "branded";

export type TiktokPublicationSettings = {
  privacyLevel: TiktokPrivacyLevel;
  allowComments: boolean;
  allowDuo: boolean;
  allowStitch: boolean;
  commercialContent: TiktokCommercialContent;
  aiContent: boolean;
  photoAutoMusic: boolean;
  musicUsageConfirmed: boolean;
};

type CreatorInfo = {
  username: string;
  displayName: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoDurationSeconds: number | null;
};

type PublishModalStyles = Readonly<Record<string, string>>;

type Props = {
  open: boolean;
  styles: PublishModalStyles;
  isMobile: boolean;
  mediaType: "video" | "images";
  videoDurationSeconds: number | null;
  onCancel: () => void;
  onValidate: (settings: TiktokPublicationSettings) => void;
};

const privacyLabels: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Tout le monde",
  MUTUAL_FOLLOW_FRIENDS: "Amis mutuels",
  FOLLOWER_OF_CREATOR: "Abonnés",
  SELF_ONLY: "Moi uniquement",
};

function formatDuration(seconds: number | null) {
  if (!seconds || !Number.isFinite(seconds)) return "durée non détectée";
  const rounded = Math.round(seconds);
  const min = Math.floor(rounded / 60);
  const sec = rounded % 60;
  return min ? `${min} min ${String(sec).padStart(2, "0")} s` : `${sec} s`;
}

async function readJson(res: Response) {
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(String(json?.error || "Impossible de charger TikTok."));
  }
  return json;
}

function TiktokSettingsLoader() {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 18,
        background: "rgba(76,195,255,0.07)",
        border: "1px solid rgba(76,195,255,0.18)",
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 14,
        alignItems: "center",
        minHeight: 108,
      }}
    >
      <style>{`@keyframes inrcy-tiktok-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div
        aria-hidden="true"
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          border: "3px solid rgba(255,255,255,0.16)",
          borderTopColor: "rgba(76,195,255,0.95)",
          animation: "inrcy-tiktok-spin 0.85s linear infinite",
        }}
      />
      <div style={{ display: "grid", gap: 4 }}>
        <strong style={{ color: "#fff", fontSize: 14 }}>Chargement des autorisations TikTok…</strong>
        <span style={{ color: "rgba(255,255,255,0.68)", fontSize: 13, lineHeight: 1.45 }}>
          iNrCy récupère les options réelles du compte : visibilité, commentaires, Duo, Stitch et durée maximale.
        </span>
      </div>
    </div>
  );
}

export default function TiktokPublicationSettingsModal({
  open,
  styles,
  isMobile,
  mediaType,
  videoDurationSeconds,
  onCancel,
  onValidate,
}: Props) {
  const [creatorInfo, setCreatorInfo] = useState<CreatorInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [privacyLevel, setPrivacyLevel] = useState("");
  const [allowComments, setAllowComments] = useState(false);
  const [allowDuo, setAllowDuo] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [commercialContent, setCommercialContent] = useState<TiktokCommercialContent>("none");
  const [aiContent, setAiContent] = useState(false);
  const [musicUsageConfirmed, setMusicUsageConfirmed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    setCreatorInfo(null);
    setPrivacyLevel("");
    setAllowComments(false);
    setAllowDuo(false);
    setAllowStitch(false);
    setCommercialContent("none");
    setAiContent(false);
    setMusicUsageConfirmed(false);

    fetch("/api/integrations/tiktok/creator-info", { credentials: "include" }).then(readJson)
      .then((json) => {
        if (!active) return;
        setCreatorInfo(json.creatorInfo as CreatorInfo);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Impossible de charger TikTok.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  const durationBlocker = useMemo(() => {
    if (!creatorInfo || mediaType !== "video") return "";
    const max = creatorInfo.maxVideoDurationSeconds;
    const actual = videoDurationSeconds;
    if (!max || !actual || !Number.isFinite(actual)) return "";
    return actual > max
      ? `Cette vidéo dure ${formatDuration(actual)}. TikTok limite ce compte à ${formatDuration(max)}.`
      : "";
  }, [creatorInfo, mediaType, videoDurationSeconds]);

  const canValidate = Boolean(
    creatorInfo &&
      privacyLevel &&
      !durationBlocker &&
      musicUsageConfirmed &&
      (commercialContent === "none" || commercialContent === "self" || commercialContent === "branded"),
  );

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10013,
        background: "rgba(4, 8, 18, 0.78)",
        backdropFilter: "blur(8px)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        overflowY: "auto",
        overscrollBehavior: "contain",
      }}
    >
      <div
        className={styles.blockCard}
        style={{
          width: "min(620px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          display: "grid",
          gap: 14,
          background: "#111827",
          backgroundImage: "none",
          border: "1px solid rgba(148, 163, 184, 0.28)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.62)",
          backdropFilter: "none",
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 22 }}>🎵</div>
          <div className={styles.blockTitle} style={{ marginBottom: 0 }}>
            Paramètres TikTok de cette publication
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>
            TikTok a été sélectionné. Validez ces éléments pour cette publication uniquement.
          </div>
        </div>

        {loading ? <TiktokSettingsLoader /> : null}

        {error ? (
          <div
            style={{
              borderRadius: 14,
              padding: 12,
              background: "rgba(248,113,113,0.10)",
              border: "1px solid rgba(248,113,113,0.24)",
              color: "#fecaca",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        ) : null}

        {creatorInfo ? (
          <>
            <div
              style={{
                borderRadius: 14,
                padding: 12,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
                display: "grid",
                gap: 6,
                fontSize: 13,
                color: "rgba(255,255,255,0.82)",
              }}
            >
              <strong style={{ color: "#fff" }}>Compte utilisé : {creatorInfo.username || creatorInfo.displayName || "Compte TikTok connecté"}</strong>
              {mediaType === "video" ? (
                <span>Durée vidéo : {formatDuration(videoDurationSeconds)}{creatorInfo.maxVideoDurationSeconds ? ` · maximum TikTok : ${formatDuration(creatorInfo.maxVideoDurationSeconds)}` : ""}</span>
              ) : (
                <span>Publication photo TikTok.</span>
              )}
            </div>

            {durationBlocker ? (
              <div
                style={{
                  borderRadius: 14,
                  padding: 12,
                  background: "rgba(248,113,113,0.10)",
                  border: "1px solid rgba(248,113,113,0.24)",
                  color: "#fecaca",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                ⛔ {durationBlocker}
              </div>
            ) : null}

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", fontWeight: 800 }}>Visibilité TikTok obligatoire</span>
              <select
                value={privacyLevel}
                onChange={(event) => setPrivacyLevel(event.target.value)}
                style={{
                  width: "100%",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(15,23,42,0.95)",
                  color: "white",
                  colorScheme: "dark",
                  padding: "10px 12px",
                  outline: "none",
                }}
              >
                <option value="">Choisir la visibilité</option>
                {creatorInfo.privacyLevelOptions.map((option) => (
                  <option key={option} value={option}>{privacyLabels[option] || option}</option>
                ))}
              </select>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 10 }}>
              <label style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", padding: "10px 12px", color: creatorInfo.commentDisabled ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.88)", fontSize: 13 }}>
                Commentaires
                <input type="checkbox" checked={allowComments} disabled={creatorInfo.commentDisabled} onChange={(event) => setAllowComments(event.target.checked)} />
              </label>
              {mediaType === "video" ? (
                <>
                  <label style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", padding: "10px 12px", color: creatorInfo.duetDisabled ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.88)", fontSize: 13 }}>
                    Duo
                    <input type="checkbox" checked={allowDuo} disabled={creatorInfo.duetDisabled} onChange={(event) => setAllowDuo(event.target.checked)} />
                  </label>
                  <label style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", padding: "10px 12px", color: creatorInfo.stitchDisabled ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.88)", fontSize: 13 }}>
                    Stitch
                    <input type="checkbox" checked={allowStitch} disabled={creatorInfo.stitchDisabled} onChange={(event) => setAllowStitch(event.target.checked)} />
                  </label>
                </>
              ) : null}
            </div>
            {creatorInfo.commentDisabled || (mediaType === "video" && (creatorInfo.duetDisabled || creatorInfo.stitchDisabled)) ? (
              <div style={{ color: "rgba(255,255,255,0.54)", fontSize: 12, lineHeight: 1.45 }}>
                Les options grisées sont désactivées dans les réglages du compte TikTok connecté.
              </div>
            ) : null}

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", fontWeight: 800 }}>Contenu commercial</span>
              <select
                value={commercialContent}
                onChange={(event) => setCommercialContent(event.target.value as TiktokCommercialContent)}
                style={{
                  width: "100%",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(15,23,42,0.95)",
                  color: "white",
                  colorScheme: "dark",
                  padding: "10px 12px",
                  outline: "none",
                }}
              >
                <option value="none">Aucun</option>
                <option value="self">Ma marque / mon entreprise</option>
                <option value="branded">Partenariat rémunéré / autre marque</option>
              </select>
            </label>

            <label
              style={{
                display: "grid",
                gap: 6,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                padding: "10px 12px",
                color: "rgba(255,255,255,0.88)",
                fontSize: 13,
              }}
            >
              <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                Vidéo ou photo générée/modifiée par IA
                <input type="checkbox" checked={aiContent} onChange={(event) => setAiContent(event.target.checked)} />
              </span>
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 12, lineHeight: 1.45 }}>
                À cocher uniquement si le média visuel ou audio a été généré ou fortement modifié par IA. Le texte généré par iNrCy seul ne nécessite pas cette déclaration.
              </span>
            </label>

            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                borderRadius: 14,
                padding: 12,
                background: "rgba(76,195,255,0.08)",
                border: "1px solid rgba(76,195,255,0.18)",
                color: "rgba(255,255,255,0.82)",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <input type="checkbox" checked={musicUsageConfirmed} onChange={(event) => setMusicUsageConfirmed(event.target.checked)} style={{ marginTop: 3 }} />
              <span>En publiant, j’accepte la Music Usage Confirmation de TikTok pour cette publication.</span>
            </label>
          </>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", position: "sticky", bottom: -1, paddingTop: 4, background: "#111827" }}>
          <button type="button" className={styles.secondaryBtn} onClick={onCancel}>Retour modifier</button>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={!canValidate || loading}
            style={{ opacity: !canValidate || loading ? 0.58 : 1 }}
            onClick={() => {
              if (!canValidate) return;
              onValidate({
                privacyLevel,
                allowComments: allowComments && !creatorInfo?.commentDisabled,
                allowDuo: mediaType === "video" ? allowDuo && !creatorInfo?.duetDisabled : false,
                allowStitch: mediaType === "video" ? allowStitch && !creatorInfo?.stitchDisabled : false,
                commercialContent,
                aiContent,
                photoAutoMusic: false,
                musicUsageConfirmed,
              });
            }}
          >
            Valider les paramètres TikTok
          </button>
        </div>
      </div>
    </div>
  );
}
