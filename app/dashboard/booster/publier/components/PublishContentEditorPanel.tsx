import type {
  Dispatch,
  KeyboardEvent,
  MutableRefObject,
  SetStateAction,
} from "react";
import { stripSiteTextFormatting } from "@/lib/boosterFormatting";
import {
  BOOSTER_PREFERRED_CTA_OPTIONS,
  CHANNEL_TEXT_GUIDELINES,
  DISPLAY_LABELS,
  getChannelDefaultCtaLabel,
  getCtaModeHelp,
  getPreferredCtaChoiceFromPost,
  getWebsiteSourceLabelForChannel,
  getWebsiteUrlForChannel,
  isSiteDisplayKey,
  renderLimitCounter,
  type BoosterCtaDefaults,
  type BoosterPreferredCta,
  type ChannelKey,
  type ChannelPost,
  type DisplayKey,
} from "../publishModal.shared";
import {
  darkOptionStyle,
  darkSelectStyle,
  inputStyle,
  lightFieldStyle,
  pillBtn,
  textAreaStyle,
} from "../publishModal.styles";
import RichSiteContentEditor from "./RichSiteContentEditor";

type PublishModalStyles = Readonly<Record<string, string>>;

type DuplicateFeedback = {
  kind: "success" | "error";
  message: string;
} | null;

type PublishContentEditorPanelProps = {
  styles: PublishModalStyles;
  isMobile: boolean;
  displayCards: DisplayKey[];
  activeCard: DisplayKey;
  setSynchronizedActiveChannel: (channel: ChannelKey) => void;
  getDisplayPost: (key: DisplayKey) => ChannelPost;
  updatePost: (
    channel: ChannelKey,
    patch: Partial<ChannelPost>,
    options?: { sanitize?: boolean },
  ) => void;
  applySiteContentFormat: (kind: "bold" | "italic" | "underline") => void;
  siteContentEditorRef: MutableRefObject<HTMLDivElement | null>;
  contentTextAreaRef: MutableRefObject<HTMLTextAreaElement | null>;
  ctaDefaults: BoosterCtaDefaults | null;
  applyPreferredCtaPrefill: (
    channel: ChannelKey,
    choice: BoosterPreferredCta,
  ) => void;
  instagramHashtagsInput: string;
  setInstagramHashtagsInput: Dispatch<SetStateAction<string>>;
  getLiveInstagramHashtags: () => string[];
  duplicateFeedback: DuplicateFeedback;
  onDuplicateContentToAllChannels: () => void;
  pinterestBoards: Array<{ id: string; name: string }>;
  pinterestBoardId: string;
  pinterestBoardsLoading: boolean;
  pinterestBoardsError: string;
  onPinterestBoardChange: (boardId: string) => void;
  onRefreshPinterestBoards: () => void;
};

export default function PublishContentEditorPanel({
  styles,
  isMobile,
  displayCards,
  activeCard,
  setSynchronizedActiveChannel,
  getDisplayPost,
  updatePost,
  applySiteContentFormat,
  siteContentEditorRef,
  contentTextAreaRef,
  ctaDefaults,
  applyPreferredCtaPrefill,
  instagramHashtagsInput,
  setInstagramHashtagsInput,
  getLiveInstagramHashtags,
  duplicateFeedback,
  onDuplicateContentToAllChannels,
  pinterestBoards,
  pinterestBoardId,
  pinterestBoardsLoading,
  pinterestBoardsError,
  onPinterestBoardChange,
  onRefreshPinterestBoards,
}: PublishContentEditorPanelProps) {
  const keepEditorTypingInsideField = (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    // Les bulles/carrousels du dashboard utilisent Espace/Entrée comme raccourcis clavier.
    // Quand on édite un titre ou un contenu, on bloque seulement la propagation
    // pour éviter qu'un parent intercepte la touche Espace, sans empêcher la saisie.
    event.stopPropagation();
  };

  return (
    <div
      className={styles.blockCard}
      style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
    >
      <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
        Contenus par canal
      </div>
      <div
        className={styles.subtitle}
        style={{ marginBottom: 10, maxWidth: "none", whiteSpace: "normal" }}
      >
        Vérifiez chaque contenu et adaptez le si besoin.
      </div>
      {displayCards.length ? (
        <>
          <div
            style={{
              display: isMobile ? "grid" : "flex",
              gridTemplateColumns: isMobile
                ? "repeat(2, minmax(0, 1fr))"
                : undefined,
              gap: 8,
              flexWrap: isMobile ? undefined : "wrap",
              marginBottom: 12,
              overflowX: "hidden",
            }}
          >
            {displayCards.map((key, index) => {
              const post = getDisplayPost(key);
              const isLastOddMobileItem =
                isMobile &&
                index === displayCards.length - 1 &&
                displayCards.length % 2 === 1;
              const hasText = !!(
                String(post.title || "").trim() ||
                String(post.content || "").trim()
              );
              const statusStyle = hasText
                ? {
                    border: "1px solid rgba(34,197,94,0.34)",
                    color: "#bbf7d0",
                    background: "rgba(34,197,94,0.10)",
                  }
                : {
                    border: "1px solid rgba(251,191,36,0.36)",
                    color: "#fde68a",
                    background: "rgba(251,191,36,0.10)",
                  };
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSynchronizedActiveChannel(key)}
                  title={hasText ? "Texte présent" : "Texte à vérifier"}
                  style={{
                    ...pillBtn,
                    ...statusStyle,
                    ...(activeCard === key
                      ? {
                          border: hasText
                            ? "2px solid rgba(74,222,128,0.90)"
                            : "2px solid rgba(250,204,21,0.92)",
                          boxShadow: hasText
                            ? "0 0 0 1px rgba(74,222,128,0.26) inset, 0 0 0 1px rgba(74,222,128,0.20), 0 0 18px rgba(74,222,128,0.20)"
                            : "0 0 0 1px rgba(250,204,21,0.26) inset, 0 0 0 1px rgba(250,204,21,0.20), 0 0 18px rgba(250,204,21,0.16)",
                        }
                      : {}),
                    ...(isMobile
                      ? {
                          width: isLastOddMobileItem
                            ? "calc(50% - 4px)"
                            : "100%",
                          gridColumn: isLastOddMobileItem
                            ? "1 / -1"
                            : undefined,
                          justifySelf: isLastOddMobileItem
                            ? "center"
                            : undefined,
                          minWidth: 0,
                          minHeight: 36,
                          padding: "0 8px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                        }
                      : {}),
                  }}
                >
                  {DISPLAY_LABELS[key]}
                </button>
              );
            })}
          </div>
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 16,
              padding: 12,
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 10 }}>
              {DISPLAY_LABELS[activeCard]}
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {activeCard === "pinterest" ? (
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.85 }}>Tableau Pinterest</div>
                    <button
                      type="button"
                      onClick={onRefreshPinterestBoards}
                      disabled={pinterestBoardsLoading}
                      style={{
                        ...pillBtn,
                        minHeight: 30,
                        padding: "0 10px",
                        opacity: pinterestBoardsLoading ? 0.6 : 1,
                      }}
                    >
                      {pinterestBoardsLoading ? "Chargement…" : "Actualiser"}
                    </button>
                  </div>
                  <select
                    value={pinterestBoardId}
                    onChange={(event) => onPinterestBoardChange(event.target.value)}
                    disabled={pinterestBoardsLoading}
                    style={darkSelectStyle}
                  >
                    <option value="" style={darkOptionStyle}>
                      Choisir un tableau
                    </option>
                    {pinterestBoards.map((board) => (
                      <option key={board.id} value={board.id} style={darkOptionStyle}>
                        {board.name}
                      </option>
                    ))}
                  </select>
                  {pinterestBoardsError ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#fecaca" }}>
                      {pinterestBoardsError}
                    </div>
                  ) : !pinterestBoardsLoading && !pinterestBoards.length ? (
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>
                      Aucun tableau disponible. Créez-en un dans Configurer Pinterest.
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div>
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
                  Titre
                </div>
                {isMobile ? (
                  <textarea
                    value={getDisplayPost(activeCard).title}
                    onKeyDown={keepEditorTypingInsideField}
                    onChange={(e) =>
                      updatePost(activeCard, { title: e.target.value })
                    }
                    style={{
                      ...inputStyle,
                      minHeight: 64,
                      height: 64,
                      padding: "10px 14px",
                      lineHeight: 1.35,
                      resize: "none",
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                    }}
                    rows={2}
                    placeholder="Titre"
                  />
                ) : (
                  <input
                    value={getDisplayPost(activeCard).title}
                    onKeyDown={keepEditorTypingInsideField}
                    onChange={(e) =>
                      updatePost(activeCard, { title: e.target.value })
                    }
                    style={inputStyle}
                    placeholder="Titre"
                  />
                )}
                {renderLimitCounter(
                  "Titre",
                  getDisplayPost(activeCard).title.length,
                  CHANNEL_TEXT_GUIDELINES[activeCard].title,
                )}
              </div>
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    marginBottom: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.85 }}>Contenu</div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    {!isSiteDisplayKey(activeCard) ? (
                      <span
                        style={{
                          fontSize: 11,
                          color: "rgba(255,255,255,0.48)",
                          marginRight: 2,
                        }}
                      >
                        Formatage réservé au site internet
                      </span>
                    ) : null}
                    {(
                      [
                        ["bold", "B", "Gras"],
                        ["italic", "I", "Italique"],
                        ["underline", "U", "Souligné"],
                      ] as const
                    ).map(([kind, label, title]) => (
                      <button
                        key={kind}
                        type="button"
                        title={
                          isSiteDisplayKey(activeCard)
                            ? title
                            : "Disponible uniquement pour Site internet"
                        }
                        aria-label={title}
                        disabled={!isSiteDisplayKey(activeCard)}
                        onMouseDown={(event) => {
                          if (event.cancelable) event.preventDefault();
                          applySiteContentFormat(kind);
                        }}
                        style={{
                          minWidth: 32,
                          height: 30,
                          borderRadius: 9,
                          border: isSiteDisplayKey(activeCard)
                            ? "1px solid rgba(76,195,255,0.35)"
                            : "1px solid rgba(255,255,255,0.10)",
                          background: isSiteDisplayKey(activeCard)
                            ? "rgba(76,195,255,0.12)"
                            : "rgba(255,255,255,0.04)",
                          color: isSiteDisplayKey(activeCard)
                            ? "#eaf7ff"
                            : "rgba(255,255,255,0.32)",
                          fontWeight: 900,
                          fontStyle: kind === "italic" ? "italic" : "normal",
                          textDecoration:
                            kind === "underline" ? "underline" : "none",
                          cursor: isSiteDisplayKey(activeCard)
                            ? "pointer"
                            : "not-allowed",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {isSiteDisplayKey(activeCard) ? (
                  <RichSiteContentEditor
                    value={getDisplayPost(activeCard).content}
                    onChange={(content) => updatePost(activeCard, { content })}
                    minHeight={280}
                    editorRef={siteContentEditorRef}
                    style={textAreaStyle}
                  />
                ) : (
                  <textarea
                    ref={(element) => {
                      contentTextAreaRef.current = element;
                    }}
                    value={getDisplayPost(activeCard).content}
                    onKeyDown={keepEditorTypingInsideField}
                    onChange={(e) => {
                      updatePost(
                        activeCard,
                        { content: e.target.value },
                        { sanitize: false },
                      );
                    }}
                    style={{
                      ...textAreaStyle,
                      minHeight: 280,
                      height: isMobile ? 260 : 280,
                      maxHeight: isMobile ? 360 : 420,
                      resize: "vertical",
                      overflowY: "auto",
                    }}
                    rows={10}
                    placeholder="Contenu"
                  />
                )}
                {renderLimitCounter(
                  "Contenu",
                  isSiteDisplayKey(activeCard)
                    ? stripSiteTextFormatting(
                        getDisplayPost(activeCard).content,
                      ).length
                    : getDisplayPost(activeCard).content.length,
                  CHANNEL_TEXT_GUIDELINES[activeCard].content,
                )}
              </div>
              <div>
                {(() => {
                  const currentPost = getDisplayPost(activeCard);
                  const ctaMode = currentPost.ctaMode || "none";
                  const ctaChoice = getPreferredCtaChoiceFromPost(
                    activeCard,
                    currentPost,
                  );
                  const updateTarget = activeCard;
                  const activeWebsiteUrl = getWebsiteUrlForChannel(
                    activeCard,
                    ctaDefaults,
                  );
                  const activeWebsiteSourceLabel =
                    getWebsiteSourceLabelForChannel(activeCard, ctaDefaults);
                  const websiteChoices = [
                    ctaDefaults?.inrcySiteUrl
                      ? { label: "Site iNrCy", url: ctaDefaults.inrcySiteUrl }
                      : null,
                    ctaDefaults?.siteWebUrl
                      ? { label: "Site web", url: ctaDefaults.siteWebUrl }
                      : null,
                  ].filter(Boolean) as Array<{ label: string; url: string }>;
                  const ctaGridColumns = isMobile
                    ? "1fr"
                    : ctaMode === "website" || ctaMode === "custom"
                      ? "minmax(0, 0.8fr) minmax(0, 1.1fr) minmax(0, 1fr)"
                      : ctaMode === "call"
                        ? "minmax(0, 0.9fr) minmax(0, 1.1fr)"
                        : "minmax(0, 0.9fr)";

                  return (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: ctaGridColumns,
                          gap: 10,
                          alignItems: "start",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 12,
                              opacity: 0.85,
                              marginBottom: 6,
                            }}
                          >
                            Bouton
                          </div>
                          <select
                            value={ctaChoice}
                            onChange={(e) =>
                              applyPreferredCtaPrefill(
                                activeCard,
                                e.target.value as BoosterPreferredCta,
                              )
                            }
                            style={darkSelectStyle}
                          >
                            {BOOSTER_PREFERRED_CTA_OPTIONS.map((option) => (
                              <option
                                key={option.value}
                                value={option.value}
                                style={darkOptionStyle}
                              >
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        {ctaMode === "website" ? (
                          <>
                            <div>
                              <div
                                style={{
                                  fontSize: 12,
                                  opacity: 0.85,
                                  marginBottom: 6,
                                }}
                              >
                                URL de destination
                              </div>
                              <input
                                value={currentPost.ctaUrl || ""}
                                onChange={(e) =>
                                  updatePost(updateTarget, {
                                    ctaUrl: e.target.value,
                                  })
                                }
                                style={lightFieldStyle}
                                placeholder={
                                  activeWebsiteUrl
                                    ? `URL du site préremplie (${activeWebsiteSourceLabel})`
                                    : websiteChoices.length > 1
                                      ? "Choisissez Site iNrCy ou Site web"
                                      : "URL du site (optionnel)"
                                }
                              />
                              {websiteChoices.length ? (
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 6,
                                    flexWrap: "wrap",
                                    marginTop: 7,
                                  }}
                                >
                                  {websiteChoices.map((choice) => (
                                    <button
                                      key={choice.label}
                                      type="button"
                                      onClick={() =>
                                        updatePost(updateTarget, {
                                          ctaUrl: choice.url,
                                        })
                                      }
                                      style={{
                                        border:
                                          currentPost.ctaUrl === choice.url
                                            ? "1px solid rgba(76,195,255,0.55)"
                                            : "1px solid rgba(255,255,255,0.14)",
                                        background:
                                          currentPost.ctaUrl === choice.url
                                            ? "rgba(76,195,255,0.14)"
                                            : "rgba(255,255,255,0.06)",
                                        color: "rgba(255,255,255,0.86)",
                                        borderRadius: 999,
                                        padding: "5px 9px",
                                        fontSize: 11,
                                        fontWeight: 800,
                                        cursor: "pointer",
                                      }}
                                    >
                                      {choice.label}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: 12,
                                  opacity: 0.85,
                                  marginBottom: 6,
                                }}
                              >
                                Texte du bouton
                              </div>
                              <input
                                value={currentPost.cta}
                                onChange={(e) =>
                                  updatePost(updateTarget, {
                                    cta: e.target.value,
                                  })
                                }
                                style={lightFieldStyle}
                                placeholder={`Texte du bouton (ex : ${getChannelDefaultCtaLabel(activeCard, "website") || "Voir le site"})`}
                              />
                            </div>
                          </>
                        ) : null}
                        {ctaMode === "call" ? (
                          <div>
                            <div
                              style={{
                                fontSize: 12,
                                opacity: 0.85,
                                marginBottom: 6,
                              }}
                            >
                              Téléphone
                            </div>
                            <input
                              value={currentPost.ctaPhone || ""}
                              onChange={(e) =>
                                updatePost(updateTarget, {
                                  ctaPhone: e.target.value,
                                })
                              }
                              style={lightFieldStyle}
                              placeholder={
                                ctaDefaults?.phone
                                  ? "Téléphone prérempli depuis Mon profil"
                                  : "Téléphone (optionnel)"
                              }
                            />
                          </div>
                        ) : null}
                        {ctaMode === "custom" ? (
                          <>
                            <div>
                              <div
                                style={{
                                  fontSize: 12,
                                  opacity: 0.85,
                                  marginBottom: 6,
                                }}
                              >
                                URL de destination
                              </div>
                              <input
                                value={currentPost.ctaUrl || ""}
                                onChange={(e) =>
                                  updatePost(updateTarget, {
                                    ctaUrl: e.target.value,
                                  })
                                }
                                style={lightFieldStyle}
                                placeholder="URL personnalisée (optionnel)"
                              />
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: 12,
                                  opacity: 0.85,
                                  marginBottom: 6,
                                }}
                              >
                                Texte du bouton
                              </div>
                              <input
                                value={currentPost.cta}
                                onChange={(e) =>
                                  updatePost(updateTarget, {
                                    cta: e.target.value,
                                  })
                                }
                                style={lightFieldStyle}
                                placeholder="Ex : En savoir plus"
                              />
                            </div>
                          </>
                        ) : null}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          marginTop: 6,
                          color: "rgba(255,255,255,0.62)",
                          lineHeight: 1.45,
                        }}
                      >
                        {getCtaModeHelp(activeCard, ctaMode)}
                      </div>
                      {ctaMode === "website" && activeWebsiteUrl ? (
                        <div
                          style={{
                            fontSize: 11,
                            marginTop: 8,
                            color: "rgba(255,255,255,0.62)",
                            lineHeight: 1.45,
                          }}
                        >
                          Valeur par défaut disponible depuis{" "}
                          {activeWebsiteSourceLabel.toLowerCase()} :{" "}
                          {activeWebsiteUrl}
                        </div>
                      ) : ctaMode === "website" && websiteChoices.length > 1 ? (
                        <div
                          style={{
                            fontSize: 11,
                            marginTop: 8,
                            color: "rgba(255,255,255,0.62)",
                            lineHeight: 1.45,
                          }}
                        >
                          Deux sites sont connectés : choisissez le lien à
                          utiliser avec les boutons ci-dessus.
                        </div>
                      ) : null}
                      {ctaMode === "call" && ctaDefaults?.phone ? (
                        <div
                          style={{
                            fontSize: 11,
                            marginTop: 8,
                            color: "rgba(255,255,255,0.62)",
                            lineHeight: 1.45,
                          }}
                        >
                          Valeur par défaut disponible depuis Mon profil :{" "}
                          {ctaDefaults.phone}
                        </div>
                      ) : null}
                      {ctaMode === "website" || ctaMode === "custom"
                        ? renderLimitCounter(
                            "Bouton",
                            currentPost.cta.length,
                            CHANNEL_TEXT_GUIDELINES[activeCard].cta,
                          )
                        : null}
                    </>
                  );
                })()}
              </div>
              {activeCard === "instagram" ? (
                <div>
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
                    Hashtags
                  </div>
                  <input
                    value={instagramHashtagsInput}
                    onChange={(e) => setInstagramHashtagsInput(e.target.value)}
                    onBlur={() =>
                      updatePost("instagram", {
                        hashtags: getLiveInstagramHashtags(),
                      })
                    }
                    style={inputStyle}
                    placeholder="#local #metier"
                  />
                  {renderLimitCounter(
                    "Hashtags",
                    getLiveInstagramHashtags().length,
                    CHANNEL_TEXT_GUIDELINES.instagram.hashtags || 20,
                  )}
                </div>
              ) : null}
              {CHANNEL_TEXT_GUIDELINES[activeCard].totalLabel &&
              CHANNEL_TEXT_GUIDELINES[activeCard].totalMax &&
              CHANNEL_TEXT_GUIDELINES[activeCard].totalValue ? (
                <div style={{ marginTop: 2 }}>
                  {renderLimitCounter(
                    CHANNEL_TEXT_GUIDELINES[activeCard].totalLabel!,
                    CHANNEL_TEXT_GUIDELINES[activeCard].totalValue!(
                      activeCard === "instagram"
                        ? {
                            ...getDisplayPost(activeCard),
                            hashtags: getLiveInstagramHashtags(),
                          }
                        : getDisplayPost(activeCard),
                    ),
                    CHANNEL_TEXT_GUIDELINES[activeCard].totalMax!,
                  )}
                </div>
              ) : null}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 12,
            }}
          >
            <div
              style={{
                fontSize: 12,
                color:
                  duplicateFeedback?.kind === "error"
                    ? "#ffb4b4"
                    : "rgba(255,255,255,0.72)",
              }}
            >
              {duplicateFeedback?.message ||
                "Dupliquez le titre et le contenu du canal ouvert vers les autres canaux affichés."}
            </div>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={onDuplicateContentToAllChannels}
              disabled={displayCards.length < 2}
              style={{ marginLeft: "auto" }}
            >
              Dupliquer ce contenu sur tous les canaux
            </button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Sélectionnez d’abord vos canaux.
        </div>
      )}
    </div>
  );
}
