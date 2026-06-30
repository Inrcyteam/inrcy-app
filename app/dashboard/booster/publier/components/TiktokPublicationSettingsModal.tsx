"use client";

import { useEffect, useMemo, useState } from "react";

export type TiktokPrivacyLevel =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "FOLLOWER_OF_CREATOR"
  | "SELF_ONLY"
  | string;

export type TiktokCommercialContent = "none" | "self" | "branded" | "both";

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
  avatarUrl?: string | null;
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
  previewTitle?: string;
  previewContent?: string;
  previewHashtags?: string[];
  previewMediaUrl?: string | null;
  previewMediaName?: string;
  previewMediaCount?: number;
  onCancel: () => void;
  onValidate: (settings: TiktokPublicationSettings) => void;
};

const privacyLabels: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Tout le monde",
  MUTUAL_FOLLOW_FRIENDS: "Amis mutuels",
  FOLLOWER_OF_CREATOR: "Abonnés",
  SELF_ONLY: "Moi uniquement",
};

const commercialLabels: Record<TiktokCommercialContent, string> = {
  none: "Non, ce contenu n'est pas commercial",
  self: "Oui, il promeut mon activité / ma marque",
  branded: "Oui, il contient un partenariat ou une marque tierce",
  both: "Oui, les deux : mon activité et une marque tierce",
};

const legalLinkStyle = {
  color: "#bae6fd",
  fontWeight: 800,
  textDecoration: "underline",
  textUnderlineOffset: 3,
} as const;

const tiktokLegalLinks = {
  terms: "https://www.tiktok.com/legal/page/row/terms-of-service/en",
  communityGuidelines: "https://www.tiktok.com/community-guidelines/en/",
  musicUsageConfirmation: "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en",
  brandedContentPolicy: "https://www.tiktok.com/legal/page/global/bc-policy/en",
} as const;

function LegalLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={legalLinkStyle}>
      {label}
    </a>
  );
}

function formatDuration(seconds: number | null) {
  if (!seconds || !Number.isFinite(seconds)) return "durée non détectée";
  const rounded = Math.round(seconds);
  const min = Math.floor(rounded / 60);
  const sec = rounded % 60;
  return min ? `${min} min ${String(sec).padStart(2, "0")} s` : `${sec} s`;
}

function trimText(input: unknown, max = 280) {
  const value = String(input || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
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
  previewTitle,
  previewContent,
  previewHashtags,
  previewMediaUrl,
  previewMediaName,
  previewMediaCount,
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
  const [commercialContent, setCommercialContent] = useState<TiktokCommercialContent | "">("");
  const [aiContent, setAiContent] = useState(false);
  const [photoAutoMusic, setPhotoAutoMusic] = useState(false);
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
    setCommercialContent("");
    setAiContent(false);
    setPhotoAutoMusic(false);
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

  const mediaSummary = useMemo(() => {
    if (mediaType === "video") {
      const duration = formatDuration(videoDurationSeconds);
      return `Vidéo${previewMediaName ? ` · ${previewMediaName}` : ""} · ${duration}`;
    }
    const count = Math.max(1, Number(previewMediaCount || 0));
    return count > 1 ? `${count} photos envoyées à TikTok` : "1 photo envoyée à TikTok";
  }, [mediaType, previewMediaCount, previewMediaName, videoDurationSeconds]);

  const needsBrandedConsent = commercialContent === "branded" || commercialContent === "both";
  const canValidate = Boolean(
    creatorInfo &&
      privacyLevel &&
      !durationBlocker &&
      commercialContent &&
      musicUsageConfirmed,
  );
  const clearFinalConsent = () => {
    if (musicUsageConfirmed) setMusicUsageConfirmed(false);
  };

  if (!open) return null;

  const accountLabel = creatorInfo
    ? creatorInfo.username || creatorInfo.displayName || "Compte TikTok connecté"
    : "Compte TikTok connecté";
  const hashtags = Array.isArray(previewHashtags) ? previewHashtags.filter(Boolean) : [];
  const caption = trimText(previewContent || previewTitle || "Publication iNrCy", 420);

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
        padding: isMobile ? 10 : 18,
        overflowY: "auto",
        overscrollBehavior: "contain",
      }}
    >
      <div
        className={styles.blockCard}
        style={{
          width: isMobile ? "min(100%, 720px)" : "min(920px, 100%)",
          maxHeight: "calc(100vh - 28px)",
          overflowY: "auto",
          display: "grid",
          gap: 16,
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
            Vérification finale avant publication TikTok
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>
            Vérifiez le compte, le contenu, la visibilité, les interactions et les déclarations obligatoires avant d'envoyer cette publication sur TikTok.
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
            <section
              style={{
                borderRadius: 16,
                padding: 14,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "auto 1fr",
                gap: 14,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 999,
                  overflow: "hidden",
                  display: "grid",
                  placeItems: "center",
                  background: "linear-gradient(135deg, rgba(34,211,238,0.24), rgba(236,72,153,0.24))",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 20,
                }}
              >
                {creatorInfo.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={creatorInfo.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  (accountLabel.replace(/^@/, "").slice(0, 1) || "T").toUpperCase()
                )}
              </div>
              <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                <strong style={{ color: "#fff", fontSize: 14 }}>Compte TikTok utilisé : {accountLabel}</strong>
                {creatorInfo.displayName && creatorInfo.displayName !== accountLabel ? (
                  <span style={{ color: "rgba(255,255,255,0.64)", fontSize: 13 }}>{creatorInfo.displayName}</span>
                ) : null}
                <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 12, lineHeight: 1.45 }}>
                  Cette publication sera envoyée uniquement sur le compte TikTok connecté ci-dessus.
                </span>
              </div>
            </section>

            <section
              style={{
                borderRadius: 16,
                padding: 14,
                background: "rgba(15,23,42,0.72)",
                border: "1px solid rgba(255,255,255,0.10)",
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "220px 1fr",
                gap: 14,
              }}
            >
              <div
                style={{
                  minHeight: mediaType === "video" ? 150 : 170,
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "rgba(0,0,0,0.28)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {previewMediaUrl ? (
                  mediaType === "video" ? (
                    <video src={previewMediaUrl} controls muted playsInline style={{ width: "100%", height: "100%", objectFit: "contain", background: "#020617" }} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewMediaUrl} alt="Aperçu TikTok" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  )
                ) : (
                  <span style={{ color: "rgba(255,255,255,0.52)", fontSize: 13, textAlign: "center", padding: 12 }}>
                    Aperçu média non disponible
                  </span>
                )}
              </div>
              <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <strong style={{ color: "#fff", fontSize: 14 }}>Contenu envoyé à TikTok</strong>
                  <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>{mediaSummary}</span>
                </div>
                <div
                  style={{
                    borderRadius: 12,
                    padding: 12,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.82)",
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  {caption || "Publication iNrCy"}
                </div>
                {hashtags.length ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {hashtags.slice(0, 10).map((tag) => (
                      <span key={tag} style={{ borderRadius: 999, padding: "5px 8px", background: "rgba(76,195,255,0.10)", color: "rgba(191,239,255,0.92)", fontSize: 12 }}>
                        {tag.startsWith("#") ? tag : `#${tag}`}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>

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

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1.05fr 0.95fr",
                gap: 14,
                alignItems: "start",
              }}
            >
              <section style={{ display: "grid", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", fontWeight: 800 }}>Visibilité TikTok obligatoire</span>
                  <select
                    value={privacyLevel}
                    onChange={(event) => {
                      clearFinalConsent();
                      setPrivacyLevel(event.target.value);
                    }}
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
                  <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 1.45 }}>
                    iNrCy affiche uniquement les choix renvoyés par TikTok pour ce compte. Avant l'audit TikTok, les publications restent limitées à une visibilité privée.
                  </span>
                </label>

                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : mediaType === "video" ? "repeat(3, 1fr)" : "1fr", gap: 10 }}>
                  <label style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", padding: "10px 12px", color: creatorInfo.commentDisabled ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.88)", fontSize: 13 }}>
                    Commentaires
                    <input type="checkbox" checked={allowComments} disabled={creatorInfo.commentDisabled} onChange={(event) => {
                      clearFinalConsent();
                      setAllowComments(event.target.checked);
                    }} />
                  </label>
                  {mediaType === "video" ? (
                    <>
                      <label style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", padding: "10px 12px", color: creatorInfo.duetDisabled ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.88)", fontSize: 13 }}>
                        Duo
                        <input type="checkbox" checked={allowDuo} disabled={creatorInfo.duetDisabled} onChange={(event) => {
                          clearFinalConsent();
                          setAllowDuo(event.target.checked);
                        }} />
                      </label>
                      <label style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", padding: "10px 12px", color: creatorInfo.stitchDisabled ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.88)", fontSize: 13 }}>
                        Stitch
                        <input type="checkbox" checked={allowStitch} disabled={creatorInfo.stitchDisabled} onChange={(event) => {
                          clearFinalConsent();
                          setAllowStitch(event.target.checked);
                        }} />
                      </label>
                    </>
                  ) : null}
                </div>
                {creatorInfo.commentDisabled || (mediaType === "video" && (creatorInfo.duetDisabled || creatorInfo.stitchDisabled)) ? (
                  <div style={{ color: "rgba(255,255,255,0.54)", fontSize: 12, lineHeight: 1.45 }}>
                    Les options grisées sont désactivées par les réglages du compte TikTok connecté. Pour les photos, TikTok ne demande pas les options Duo/Stitch.
                  </div>
                ) : null}
              </section>

              <section style={{ display: "grid", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", fontWeight: 800 }}>Déclaration de contenu commercial</span>
                  <select
                    value={commercialContent}
                    onChange={(event) => {
                      clearFinalConsent();
                      setCommercialContent(event.target.value as TiktokCommercialContent | "");
                    }}
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
                    <option value="">Choisir une déclaration</option>
                    <option value="none">{commercialLabels.none}</option>
                    <option value="self">{commercialLabels.self}</option>
                    <option value="branded">{commercialLabels.branded}</option>
                    <option value="both">{commercialLabels.both}</option>
                  </select>
                </label>

                {commercialContent ? (
                  <div
                    style={{
                      borderRadius: 12,
                      padding: "10px 12px",
                      background: needsBrandedConsent ? "rgba(251,191,36,0.10)" : "rgba(76,195,255,0.07)",
                      border: needsBrandedConsent ? "1px solid rgba(251,191,36,0.22)" : "1px solid rgba(76,195,255,0.14)",
                      color: "rgba(255,255,255,0.72)",
                      fontSize: 12,
                      lineHeight: 1.45,
                    }}
                  >
                    Déclaration sélectionnée : <strong style={{ color: "#fff" }}>{commercialLabels[commercialContent]}</strong>.
                    {needsBrandedConsent ? " Le consentement final inclura aussi la Branded Content Policy TikTok." : ""}
                  </div>
                ) : null}

                {mediaType === "images" ? (
                  <label
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.12)",
                      padding: "10px 12px",
                      color: "rgba(255,255,255,0.82)",
                      fontSize: 13,
                      lineHeight: 1.45,
                    }}
                  >
                    <input type="checkbox" checked={photoAutoMusic} onChange={(event) => {
                      clearFinalConsent();
                      setPhotoAutoMusic(event.target.checked);
                    }} style={{ marginTop: 3 }} />
                    <span>Autoriser TikTok à ajouter automatiquement une musique recommandée à cette publication photo.</span>
                  </label>
                ) : null}

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
                    Média généré ou fortement modifié par IA
                    <input type="checkbox" checked={aiContent} onChange={(event) => {
                        clearFinalConsent();
                        setAiContent(event.target.checked);
                      }} />
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 12, lineHeight: 1.45 }}>
                    À cocher uniquement si le média visuel ou audio a été généré ou fortement modifié par IA. Le texte généré par iNrCy seul ne nécessite pas cette déclaration.
                  </span>
                </label>
              </section>
            </div>

            <section
              style={{
                display: "grid",
                gap: 10,
                borderRadius: 16,
                padding: 14,
                background: "rgba(76,195,255,0.08)",
                border: "1px solid rgba(76,195,255,0.18)",
                color: "rgba(255,255,255,0.82)",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: "#fff" }}>Consentement final TikTok</strong>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input type="checkbox" checked={musicUsageConfirmed} onChange={(event) => setMusicUsageConfirmed(event.target.checked)} style={{ marginTop: 3 }} />
                <span>
                  J'ai vérifié le compte TikTok, l'aperçu du contenu, la visibilité et les interactions. En publiant, j'accepte que ce contenu soit envoyé à TikTok et je confirme respecter les {" "}
                  <LegalLink href={tiktokLegalLinks.terms} label="Conditions d'utilisation TikTok" />, les {" "}
                  <LegalLink href={tiktokLegalLinks.communityGuidelines} label="Règles communautaires TikTok" /> et la {" "}
                  <LegalLink href={tiktokLegalLinks.musicUsageConfirmation} label="Music Usage Confirmation" />
                  {needsBrandedConsent ? (
                    <>
                      {" ainsi que la "}
                      <LegalLink href={tiktokLegalLinks.brandedContentPolicy} label="Branded Content Policy" />
                    </>
                  ) : null}
                  .
                </span>
              </label>
              <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                La publication ne commence qu'après cette validation manuelle. Si un paramètre est modifié ensuite, cette confirmation est redemandée.
              </span>
            </section>
          </>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", position: "sticky", bottom: -1, paddingTop: 6, background: "#111827" }}>
          <button type="button" className={styles.secondaryBtn} onClick={onCancel}>Retour modifier</button>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={!canValidate || loading}
            style={{ opacity: !canValidate || loading ? 0.58 : 1 }}
            onClick={() => {
              if (!canValidate || !commercialContent) return;
              onValidate({
                privacyLevel,
                allowComments: allowComments && !creatorInfo?.commentDisabled,
                allowDuo: mediaType === "video" ? allowDuo && !creatorInfo?.duetDisabled : false,
                allowStitch: mediaType === "video" ? allowStitch && !creatorInfo?.stitchDisabled : false,
                commercialContent,
                aiContent,
                photoAutoMusic: mediaType === "images" ? photoAutoMusic : false,
                musicUsageConfirmed,
              });
            }}
          >
            Valider et publier sur TikTok
          </button>
        </div>
      </div>
    </div>
  );
}
