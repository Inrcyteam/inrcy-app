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

function SectionIcon({ children }: { children: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 24,
        height: 24,
        borderRadius: 999,
        display: "grid",
        placeItems: "center",
        flex: "0 0 auto",
        background: "rgba(56,189,248,0.12)",
        border: "1px solid rgba(56,189,248,0.28)",
        color: "#93c5fd",
        fontSize: 13,
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <SectionIcon>{icon}</SectionIcon>
      <strong style={{ color: "#fff", fontSize: 15, lineHeight: 1.15 }}>{title}</strong>
    </div>
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

  const sectionCardStyle = {
    borderRadius: 16,
    padding: isMobile ? 14 : 12,
    background: "linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,41,59,0.56))",
    border: "1px solid rgba(148,163,184,0.22)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035)",
  } as const;

  const fieldStyle = {
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.28)",
    background: "rgba(15,23,42,0.96)",
    color: "white",
    colorScheme: "dark",
    padding: isMobile ? "11px 12px" : "9px 12px",
    outline: "none",
  } as const;

  const helperTextStyle = {
    color: "rgba(226,232,240,0.62)",
    fontSize: 12,
    lineHeight: 1.42,
  } as const;

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
          width: isMobile ? "min(100%, 720px)" : "min(1110px, calc(100vw - 36px))",
          maxHeight: isMobile ? "calc(100vh - 20px)" : "min(900px, calc(100vh - 28px))",
          overflowY: isMobile ? "auto" : "visible",
          display: "grid",
          gap: isMobile ? 12 : 10,
          background: "#111827",
          backgroundImage: "none",
          border: "1px solid rgba(148, 163, 184, 0.28)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.62)",
          backdropFilter: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{ fontSize: 28, lineHeight: 1, flex: "0 0 auto" }}>🎵</div>
          <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <div className={styles.blockTitle} style={{ marginBottom: 0, lineHeight: 1.08 }}>
              Vérification finale TikTok
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.70)", lineHeight: 1.2 }}>
              Compte, contenu, visibilité et déclarations avant envoi.
            </div>
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
            <section style={{ ...sectionCardStyle, display: "grid", gap: isMobile ? 12 : 10 }}>
              <SectionHeader icon="👤" title="Compte TikTok" />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: isMobile ? 12 : 14,
                  alignItems: "center",
                  paddingLeft: isMobile ? 0 : 34,
                }}
              >
                <div
                  style={{
                    width: isMobile ? 54 : 52,
                    height: isMobile ? 54 : 52,
                    borderRadius: 999,
                    overflow: "hidden",
                    display: "grid",
                    placeItems: "center",
                    background: "linear-gradient(135deg, rgba(124,58,237,0.95), rgba(217,70,239,0.78))",
                    border: "1px solid rgba(255,255,255,0.16)",
                    color: "#fff",
                    fontWeight: 900,
                    fontSize: 22,
                    textTransform: "lowercase",
                  }}
                >
                  {creatorInfo.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={creatorInfo.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    (accountLabel.replace(/^@/, "").slice(0, 1) || "t").toLowerCase()
                  )}
                </div>
                <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
                  <strong style={{ color: "#fff", fontSize: 14 }}>{accountLabel}</strong>
                  {creatorInfo.displayName && creatorInfo.displayName !== accountLabel ? (
                    <span style={{ color: "rgba(255,255,255,0.64)", fontSize: 13 }}>{creatorInfo.displayName}</span>
                  ) : null}
                  <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, lineHeight: 1.4 }}>
                    Cette publication sera envoyée uniquement sur ce compte TikTok connecté.
                  </span>
                </div>
              </div>
            </section>

            <section style={{ ...sectionCardStyle, display: "grid", gap: isMobile ? 12 : 10 }}>
              <SectionHeader icon="🖼️" title="Contenu envoyé" />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "200px 1fr",
                  gap: isMobile ? 14 : 14,
                  alignItems: "center",
                  paddingLeft: isMobile ? 0 : 34,
                }}
              >
                <div
                  style={{
                    minHeight: isMobile ? (mediaType === "video" ? 150 : 170) : 114,
                    height: isMobile ? undefined : 124,
                    borderRadius: 14,
                    overflow: "hidden",
                    background: "rgba(0,0,0,0.30)",
                    border: "1px solid rgba(255,255,255,0.12)",
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
                <div style={{ display: "grid", gap: isMobile ? 10 : 8, minWidth: 0 }}>
                  <div style={{ display: "grid", gap: 5 }}>
                    <strong style={{ color: "#fff", fontSize: 14 }}>{previewMediaName || (mediaType === "video" ? "Vidéo TikTok" : "Photos TikTok")}</strong>
                    <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>{mediaSummary}</span>
                  </div>
                  <div
                    style={{
                      borderRadius: 12,
                      padding: isMobile ? 12 : 12,
                      minHeight: isMobile ? 72 : 54,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      color: "rgba(255,255,255,0.84)",
                      fontSize: 13,
                      lineHeight: 1.35,
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
                  lineHeight: isMobile ? 1.5 : 1.35,
                }}
              >
                ⛔ {durationBlocker}
              </div>
            ) : null}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: isMobile ? 14 : 12,
                alignItems: "stretch",
              }}
            >
              <section style={{ ...sectionCardStyle, display: "grid", gap: isMobile ? 12 : 10 }}>
                <SectionHeader icon="⚙️" title="Paramètres de publication TikTok" />
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.70)", fontWeight: 800 }}>Visibilité</span>
                  <select
                    value={privacyLevel}
                    onChange={(event) => {
                      clearFinalConsent();
                      setPrivacyLevel(event.target.value);
                    }}
                    style={fieldStyle}
                  >
                    <option value="">Choisir la visibilité</option>
                    {creatorInfo.privacyLevelOptions.map((option) => (
                      <option key={option} value={option}>{privacyLabels[option] || option}</option>
                    ))}
                  </select>
                </label>

                <div style={{ display: "grid", gap: 7 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.70)", fontWeight: 800 }}>Interactions</span>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : mediaType === "video" ? "repeat(3, 1fr)" : "1fr", gap: isMobile ? 10 : 8 }}>
                    <label style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", borderRadius: 12, border: "1px solid rgba(148,163,184,0.22)", background: "rgba(15,23,42,0.52)", padding: isMobile ? "10px 12px" : "9px 10px", color: creatorInfo.commentDisabled ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.88)", fontSize: 13 }}>
                      <span>💬 Commentaires</span>
                      <input type="checkbox" checked={allowComments} disabled={creatorInfo.commentDisabled} onChange={(event) => {
                        clearFinalConsent();
                        setAllowComments(event.target.checked);
                      }} />
                    </label>
                    {mediaType === "video" ? (
                      <>
                        <label style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", borderRadius: 12, border: "1px solid rgba(148,163,184,0.22)", background: "rgba(15,23,42,0.52)", padding: isMobile ? "10px 12px" : "9px 10px", color: creatorInfo.duetDisabled ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.88)", fontSize: 13 }}>
                          <span>👥 Duo</span>
                          <input type="checkbox" checked={allowDuo} disabled={creatorInfo.duetDisabled} onChange={(event) => {
                            clearFinalConsent();
                            setAllowDuo(event.target.checked);
                          }} />
                        </label>
                        <label style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", borderRadius: 12, border: "1px solid rgba(148,163,184,0.22)", background: "rgba(15,23,42,0.52)", padding: isMobile ? "10px 12px" : "9px 10px", color: creatorInfo.stitchDisabled ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.88)", fontSize: 13 }}>
                          <span>✂️ Stitch</span>
                          <input type="checkbox" checked={allowStitch} disabled={creatorInfo.stitchDisabled} onChange={(event) => {
                            clearFinalConsent();
                            setAllowStitch(event.target.checked);
                          }} />
                        </label>
                      </>
                    ) : null}
                  </div>
                </div>

                <div style={helperTextStyle}>
                  Choix renvoyés par TikTok. Les options grisées suivent les réglages du compte connecté.
                  {mediaType === "images" ? " Pour les photos, TikTok ne demande pas Duo/Stitch." : ""}
                </div>
              </section>

              <section style={{ ...sectionCardStyle, display: "grid", gap: isMobile ? 12 : 10 }}>
                <SectionHeader icon="🛡️" title="Déclarations TikTok" />
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.70)", fontWeight: 800 }}>Contenu commercial</span>
                  <select
                    value={commercialContent}
                    onChange={(event) => {
                      clearFinalConsent();
                      setCommercialContent(event.target.value as TiktokCommercialContent | "");
                    }}
                    style={fieldStyle}
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
                      padding: isMobile ? "10px 12px" : "8px 10px",
                      background: needsBrandedConsent ? "rgba(251,191,36,0.10)" : "rgba(76,195,255,0.07)",
                      border: needsBrandedConsent ? "1px solid rgba(251,191,36,0.22)" : "1px solid rgba(76,195,255,0.14)",
                      color: "rgba(255,255,255,0.72)",
                      fontSize: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    Déclaration : <strong style={{ color: "#fff" }}>{commercialLabels[commercialContent]}</strong>.
                    {needsBrandedConsent
                      ? " Le consentement inclura aussi la Branded Content Policy TikTok."
                      : ""}
                  </div>
                ) : null}

                {mediaType === "images" ? (
                  <label
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      borderRadius: 12,
                      border: "1px solid rgba(148,163,184,0.22)",
                      background: "rgba(15,23,42,0.52)",
                      padding: "10px 12px",
                      color: "rgba(255,255,255,0.82)",
                      fontSize: 13,
                      lineHeight: 1.4,
                    }}
                  >
                    <input type="checkbox" checked={photoAutoMusic} onChange={(event) => {
                      clearFinalConsent();
                      setPhotoAutoMusic(event.target.checked);
                    }} style={{ marginTop: 3 }} />
                    <span>Autoriser TikTok à ajouter une musique recommandée à cette publication photo.</span>
                  </label>
                ) : null}

                <label
                  style={{
                    display: "grid",
                    gap: 6,
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.22)",
                    background: "rgba(15,23,42,0.52)",
                    padding: isMobile ? "10px 12px" : "10px 12px",
                    color: "rgba(255,255,255,0.88)",
                    fontSize: 13,
                  }}
                >
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <strong style={{ color: "#fff", fontSize: 13 }}>Contenu généré ou modifié par IA</strong>
                    <input type="checkbox" checked={aiContent} onChange={(event) => {
                        clearFinalConsent();
                        setAiContent(event.target.checked);
                      }} />
                  </span>
                  <span style={helperTextStyle}>
                    À cocher seulement si le média visuel/audio est généré ou fortement modifié par IA.
                  </span>
                </label>
              </section>
            </div>

            <section
              style={{
                ...sectionCardStyle,
                display: "grid",
                gap: isMobile ? 10 : 8,
                background: "linear-gradient(135deg, rgba(14,165,233,0.12), rgba(30,41,59,0.70))",
                border: "1px solid rgba(56,189,248,0.22)",
                color: "rgba(255,255,255,0.82)",
                fontSize: 13,
                lineHeight: isMobile ? 1.5 : 1.35,
              }}
            >
              <SectionHeader icon="✓" title="Consentement final TikTok" />
              <label style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingLeft: isMobile ? 0 : 34 }}>
                <input type="checkbox" checked={musicUsageConfirmed} onChange={(event) => setMusicUsageConfirmed(event.target.checked)} style={{ marginTop: 3 }} />
                <span>
                  J'ai vérifié le compte, le contenu, la visibilité et les interactions. J'accepte l'envoi à TikTok et je confirme respecter les {" "}
                  <LegalLink href={tiktokLegalLinks.terms} label="Conditions d'utilisation TikTok" />, les {" "}
                  <LegalLink href={tiktokLegalLinks.communityGuidelines} label="Règles communautaires TikTok" /> et la {" "}
                  <LegalLink href={tiktokLegalLinks.musicUsageConfirmation} label="Music Usage Confirmation" />
                  {needsBrandedConsent ? (
                    <>
                      {" ainsi que la "}
                      <LegalLink href={tiktokLegalLinks.brandedContentPolicy} label="Branded Content Policy TikTok" />
                    </>
                  ) : null}
                  .
                </span>
              </label>
            </section>
          </>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap", position: isMobile ? "sticky" : "static", bottom: -1, paddingTop: isMobile ? 6 : 2, background: "#111827" }}>
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
