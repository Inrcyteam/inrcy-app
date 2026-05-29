import type { MutableRefObject } from "react";
import { ChannelImageAdapterCardsPanel } from "@/app/dashboard/_components/ChannelImageAdapterTool";
import {
  BOOSTER_MAX_IMAGE_COUNT,
  BOOSTER_RECOMMENDED_VIDEO_DURATION_LABEL,
  BOOSTER_MAX_VIDEO_MB_LABEL,
  CHANNEL_PRESETS,
  getBackgroundMode,
  getOptimizedTransform,
  type ChannelImageEditorState,
  type ChannelKey,
  type ImageMeta,
  type PublicationMediaType,
  type ChannelMediaMode,
} from "../publishModal.shared";
import { pillBtn, pillBtnActive } from "../publishModal.styles";

type PublishModalStyles = Readonly<Record<string, string>>;

function formatVideoSeconds(seconds: number | null) {
  if (!Number.isFinite(Number(seconds))) return "";
  const safeSeconds = Math.max(0, Math.round(Number(seconds)));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

type ImageAdapterTab = {
  key: ChannelKey;
  label: string;
  count: number;
  tone: "ready" | "warning";
};

type PublishImagesPanelProps = {
  styles: PublishModalStyles;
  isMobile: boolean;
  publicationMediaType: PublicationMediaType;
  channelMediaModes: Partial<Record<ChannelKey, ChannelMediaMode>>;
  setChannelMediaMode: (channel: ChannelKey, mode: ChannelMediaMode) => void;
  images: File[];
  videoFile: File | null;
  videoPreviewUrl: string;
  videoDurationSeconds: number | null;
  imgError: string;
  selectedChannels: ChannelKey[];
  activeImageChannel: ChannelKey;
  imageAdapterTabs: ImageAdapterTab[];
  imageKeys: string[];
  channelImageEditors: Partial<Record<ChannelKey, ChannelImageEditorState>>;
  imageMetaByKey: Record<string, ImageMeta>;
  previewByKey: Record<string, string>;
  previewAspectRatio: string;
  getImageAdapterLabel: (channel: ChannelKey) => string;
  setSynchronizedActiveChannel: (channel: ChannelKey) => void;
  onPickImagesClick: () => void;
  onPickVideoClick: () => void;
  onTakePhotoClick: (preferredChannel?: ChannelKey) => void;
  onImagesChange: (
    files: FileList | null,
    preferredChannel?: ChannelKey,
  ) => void;
  removeVideo: () => void;
  gmbFileInputRef: MutableRefObject<HTMLInputElement | null>;
  setImgError: (message: string) => void;
  toggleChannelImage: (channel: ChannelKey, imageKey: string) => void;
  openImageEditor: (channel: ChannelKey, imageKey: string) => void;
  resetChannelImage: (channel: ChannelKey, imageKey: string) => void;
  removeImage: (index: number) => void;
  moveChannelImage: (
    channel: ChannelKey,
    imageKey: string,
    direction: -1 | 1,
  ) => void;
};

export default function PublishImagesPanel({
  styles,
  isMobile,
  publicationMediaType: _publicationMediaType,
  channelMediaModes,
  setChannelMediaMode,
  images,
  videoFile,
  videoPreviewUrl,
  videoDurationSeconds,
  imgError,
  selectedChannels,
  activeImageChannel,
  imageAdapterTabs,
  imageKeys,
  channelImageEditors,
  imageMetaByKey,
  previewByKey,
  previewAspectRatio,
  getImageAdapterLabel,
  setSynchronizedActiveChannel,
  onPickImagesClick,
  onPickVideoClick,
  onTakePhotoClick,
  onImagesChange,
  removeVideo,
  gmbFileInputRef,
  setImgError,
  toggleChannelImage,
  openImageEditor,
  resetChannelImage,
  removeImage,
  moveChannelImage,
}: PublishImagesPanelProps) {
  const hasImages = images.length > 0;
  const hasVideoMedia = Boolean(videoFile || videoPreviewUrl);
  const imagesLimitReached = images.length >= BOOSTER_MAX_IMAGE_COUNT;
  const pickImagesDisabled = imagesLimitReached;
  const pickVideoDisabled = hasVideoMedia;
  const cameraDisabled = !isMobile || imagesLimitReached;
  const activeMode: ChannelMediaMode =
    channelMediaModes[activeImageChannel] ||
    (hasVideoMedia ? "video" : hasImages ? "images" : "none");
  const activeImageKeys = channelImageEditors[activeImageChannel]?.imageKeys || [];
  const activeMediaCount =
    activeMode === "video" && hasVideoMedia
      ? 1
      : activeMode === "images"
        ? activeImageKeys.length
        : 0;

  const getModeForChannel = (channel: ChannelKey): ChannelMediaMode =>
    channelMediaModes[channel] ||
    (hasVideoMedia ? "video" : hasImages ? "images" : "none");

  const getMediaCountForChannel = (channel: ChannelKey) => {
    const mode = getModeForChannel(channel);
    if (mode === "video") return hasVideoMedia ? 1 : 0;
    if (mode === "images") return channelImageEditors[channel]?.imageKeys?.length || 0;
    return 0;
  };

  const getMediaIconForChannel = (channel: ChannelKey) => {
    const mode = getModeForChannel(channel);
    if (mode === "video") return "🎥";
    if (mode === "images") return "📷";
    return "🚫";
  };

  const mediaModeButton = (mode: ChannelMediaMode, label: string, disabled = false) => {
    const active = activeMode === mode;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setChannelMediaMode(activeImageChannel, mode)}
        style={{
          border: active
            ? "2px solid rgba(76,195,255,0.88)"
            : "1px solid rgba(255,255,255,0.13)",
          background: active
            ? "linear-gradient(135deg, rgba(36,145,190,0.34), rgba(124,92,255,0.22))"
            : "rgba(255,255,255,0.055)",
          color: active ? "#e6f8ff" : "rgba(255,255,255,0.76)",
          boxShadow: active ? "0 0 0 1px rgba(76,195,255,0.28) inset, 0 0 0 1px rgba(76,195,255,0.18), 0 0 14px rgba(76,195,255,0.16)" : undefined,
          borderRadius: 999,
          minHeight: isMobile ? 34 : 36,
          padding: isMobile ? "0 8px" : "0 14px",
          fontSize: isMobile ? 11 : 12,
          fontWeight: 900,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.45 : 1,
          whiteSpace: "nowrap",
          flex: isMobile ? "1 1 0" : "0 0 auto",
          minWidth: 0,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className={styles.blockCard}
      style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <div className={styles.blockTitle}>Médias de la publication</div>
      </div>
      <div
        className={styles.subtitle}
        style={{ marginBottom: 12, maxWidth: "none", whiteSpace: "normal" }}
      >
        Choisissez vos images ou une vidéo. Les images restent ajustables par
        canal. En vidéo, l’IA peut utiliser les captures et l’audio détecté.
      </div>
      <input
        ref={gmbFileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          onImagesChange(e.target.files, "gmb");
          e.currentTarget.value = "";
        }}
      />
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onPickImagesClick}
          disabled={pickImagesDisabled}
          title={
            imagesLimitReached
              ? `${BOOSTER_MAX_IMAGE_COUNT} images maximum`
              : undefined
          }
          style={{
            opacity: pickImagesDisabled ? 0.48 : 1,
            filter: pickImagesDisabled ? "grayscale(1)" : undefined,
            cursor: pickImagesDisabled ? "not-allowed" : "pointer",
          }}
        >
          + Ajouter des images
        </button>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onPickVideoClick}
          disabled={pickVideoDisabled}
          title={
            pickVideoDisabled
              ? "1 vidéo maximum par publication."
              : `1 vidéo maximum · ${BOOSTER_MAX_VIDEO_MB_LABEL} max · ${BOOSTER_RECOMMENDED_VIDEO_DURATION_LABEL}`
          }
          style={{
            opacity: pickVideoDisabled ? 0.48 : 1,
            filter: pickVideoDisabled ? "grayscale(1)" : undefined,
            cursor: pickVideoDisabled ? "not-allowed" : "pointer",
          }}
        >
          + Ajouter une vidéo
        </button>
        <span
          title={
            !isMobile
              ? "Utilisable en version mobile"
              : imagesLimitReached
                ? `${BOOSTER_MAX_IMAGE_COUNT} images maximum`
                : "Ouvrir l’Appareil iNrCy pour prendre une photo"
          }
          style={{ display: "inline-flex" }}
        >
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={!cameraDisabled ? () => onTakePhotoClick() : undefined}
            disabled={cameraDisabled}
            aria-disabled={cameraDisabled}
            style={{
              opacity: cameraDisabled ? 0.48 : 1,
              filter: cameraDisabled ? "grayscale(1)" : undefined,
              cursor: cameraDisabled ? "not-allowed" : "pointer",
            }}
          >
            📷 Appareil iNrCy
          </button>
        </span>
        <div
          style={{
            fontSize: 12,
            opacity: hasImages || hasVideoMedia ? 0.85 : 0.7,
            lineHeight: 1.45,
            minWidth: 0,
            overflowWrap: "anywhere",
          }}
        >
          {hasImages || hasVideoMedia
            ? `${images.length}/${BOOSTER_MAX_IMAGE_COUNT} image${images.length > 1 ? "s" : ""}${hasVideoMedia ? ` · 1 vidéo · IA vidéo + audio · ${BOOSTER_MAX_VIDEO_MB_LABEL} max · ${BOOSTER_RECOMMENDED_VIDEO_DURATION_LABEL}` : ""}`
            : "Aucun média ajouté"}
        </div>
      </div>
      {imgError ? (
        <div style={{ marginBottom: 10, fontSize: 13, color: "#ffb4b4" }}>
          {imgError}
        </div>
      ) : null}

      {selectedChannels.length ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "repeat(2, minmax(0, 1fr))"
                : `repeat(${Math.min(Math.max(selectedChannels.length, 1), 6)}, minmax(0, 1fr))`,
              gap: 8,
              width: "100%",
            }}
          >
            {selectedChannels.map((channel) => {
              const count = getMediaCountForChannel(channel);
              const mediaIcon = getMediaIconForChannel(channel);
              const toneReady = count > 0;
              const isActive = activeImageChannel === channel;
              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() => setSynchronizedActiveChannel(channel)}
                  style={{
                    minWidth: 0,
                    width: "100%",
                    minHeight: 38,
                    borderRadius: 999,
                    padding: "0 10px",
                    border: isActive
                      ? toneReady
                        ? "2px solid rgba(74,222,128,0.90)"
                        : "2px solid rgba(250,204,21,0.92)"
                      : toneReady
                        ? "1px solid rgba(34,197,94,0.34)"
                        : "1px solid rgba(251,191,36,0.36)",
                    background: toneReady
                      ? "rgba(34,197,94,0.10)"
                      : "rgba(251,191,36,0.10)",
                    color: toneReady ? "#bbf7d0" : "#fde68a",
                    boxShadow: isActive
                      ? toneReady
                        ? "0 0 0 1px rgba(74,222,128,0.28) inset, 0 0 0 1px rgba(74,222,128,0.22), 0 0 18px rgba(74,222,128,0.22)"
                        : "0 0 0 1px rgba(250,204,21,0.28) inset, 0 0 0 1px rgba(250,204,21,0.22), 0 0 18px rgba(250,204,21,0.18)"
                      : undefined,
                    fontSize: isMobile ? 12 : 13,
                    fontWeight: 900,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {getImageAdapterLabel(channel)}
                  </span>
                  <span
                    style={{
                      flex: "0 0 auto",
                      minWidth: 20,
                      height: 20,
                      padding: "0 6px",
                      borderRadius: 999,
                      display: "inline-grid",
                      placeItems: "center",
                      fontSize: 11,
                      fontWeight: 900,
                      background: "rgba(255,255,255,0.12)",
                    }}
                  >
                    {count}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      flex: "0 0 auto",
                      fontSize: 13,
                      lineHeight: 1,
                      filter: toneReady ? undefined : "grayscale(0.15)",
                    }}
                  >
                    {mediaIcon}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              gap: isMobile ? 6 : 8,
              flexWrap: isMobile ? "nowrap" : "wrap",
              alignItems: "center",
              width: "100%",
              minWidth: 0,
            }}
          >
            {mediaModeButton("video", "🎥 Vidéo", !hasVideoMedia)}
            {mediaModeButton("images", "📷 Photos", !hasImages)}
            {mediaModeButton("none", "🚫 Aucun")}
          </div>

          {activeMode === "none" ? (
            <div
              style={{
                borderRadius: 16,
                padding: "18px 16px",
                border: "1px solid rgba(251,191,36,0.22)",
                background: "rgba(251,191,36,0.08)",
                color: "#fde68a",
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Ce canal publiera uniquement le texte.
            </div>
          ) : activeMode === "video" ? (
            hasVideoMedia ? (
              <div
                style={{
                  display: isMobile ? "grid" : "flex",
                  alignItems: "center",
                  justifyContent: isMobile ? "center" : "flex-start",
                  gap: isMobile ? 10 : 12,
                  borderRadius: 16,
                  padding: isMobile ? 10 : 12,
                  border: "1px solid rgba(76,195,255,0.22)",
                  background: "rgba(76,195,255,0.08)",
                  width: "100%",
                  maxWidth: "100%",
                  minWidth: 0,
                  boxSizing: "border-box",
                  overflow: "hidden",
                }}
              >
                {videoPreviewUrl ? (
                  <div
                    style={{
                      width: isMobile ? "100%" : 320,
                      maxWidth: isMobile ? "min(100%, 300px)" : "100%",
                      marginInline: isMobile ? "auto" : undefined,
                      justifySelf: isMobile ? "center" : undefined,
                      alignSelf: isMobile ? "center" : undefined,
                      aspectRatio: "16 / 9",
                      height: "auto",
                      borderRadius: 14,
                      background: "#020617",
                      overflow: "hidden",
                      border: "4px solid #020617",
                      boxSizing: "border-box",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 12px 30px rgba(0,0,0,0.34)",
                    }}
                  >
                    <video
                      src={videoPreviewUrl}
                      controls
                      playsInline
                      preload="metadata"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        borderRadius: 10,
                        background: "#020617",
                        display: "block",
                      }}
                    />
                  </div>
                ) : null}
                <div
                  style={{
                    display: "grid",
                    gap: 7,
                    minWidth: 0,
                    justifyItems: isMobile ? "center" : "start",
                    textAlign: isMobile ? "center" : "left",
                  }}
                >
                  <strong
                    style={{
                      fontSize: isMobile ? 11 : 12,
                      maxWidth: isMobile ? 280 : 360,
                      overflowWrap: "anywhere",
                      lineHeight: 1.25,
                    }}
                  >
                    {videoFile?.name || "Vidéo sélectionnée"}
                  </strong>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => setChannelMediaMode(activeImageChannel, "none")}
                    style={{ minHeight: 30, padding: "5px 10px", fontSize: 11 }}
                  >
                    Retirer du canal
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, opacity: 0.75 }}>
                Ajoutez une vidéo ou choisissez Photos / Aucun média pour ce canal.
              </div>
            )
          ) : !images.length ? (
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Ajoutez une ou plusieurs images, ou choisissez Vidéo / Aucun média
              pour ce canal.
            </div>
          ) : (
            <>
              {activeImageChannel === "gmb" ? (
                <div
                  style={{
                    marginBottom: 12,
                    borderRadius: 14,
                    padding: "12px 14px",
                    border: "1px solid rgba(251,191,36,0.26)",
                    background: "rgba(251,191,36,0.10)",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: "#fde68a",
                    }}
                  >
                    <strong>Google Business : 1 seule photo par publication.</strong>{" "}
                    Les autres images restent disponibles sur les autres canaux.
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => {
                        setImgError("");
                        if (images.length >= BOOSTER_MAX_IMAGE_COUNT) return;
                        gmbFileInputRef.current?.click();
                      }}
                      disabled={images.length >= BOOSTER_MAX_IMAGE_COUNT}
                      title={
                        images.length >= BOOSTER_MAX_IMAGE_COUNT
                          ? `${BOOSTER_MAX_IMAGE_COUNT} images maximum`
                          : undefined
                      }
                      style={{
                        opacity: images.length >= BOOSTER_MAX_IMAGE_COUNT ? 0.48 : 1,
                        filter:
                          images.length >= BOOSTER_MAX_IMAGE_COUNT
                            ? "grayscale(1)"
                            : undefined,
                        cursor:
                          images.length >= BOOSTER_MAX_IMAGE_COUNT
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      + Ajouter une image spécifique Google Business
                    </button>
                    <span
                      title={
                        isMobile
                          ? images.length >= BOOSTER_MAX_IMAGE_COUNT
                            ? `${BOOSTER_MAX_IMAGE_COUNT} images maximum`
                            : "Ouvrir l’Appareil iNrCy pour Google Business"
                          : "Utilisable en version mobile"
                      }
                      style={{ display: "inline-flex" }}
                    >
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={
                          isMobile
                            ? () => {
                                setImgError("");
                                if (images.length >= BOOSTER_MAX_IMAGE_COUNT) return;
                                onTakePhotoClick("gmb");
                              }
                            : undefined
                        }
                        disabled={isMobile && images.length >= BOOSTER_MAX_IMAGE_COUNT}
                        aria-disabled={!isMobile || images.length >= BOOSTER_MAX_IMAGE_COUNT}
                        style={{
                          opacity:
                            !isMobile || images.length >= BOOSTER_MAX_IMAGE_COUNT
                              ? 0.48
                              : 1,
                          filter:
                            !isMobile || images.length >= BOOSTER_MAX_IMAGE_COUNT
                              ? "grayscale(1)"
                              : undefined,
                          cursor:
                            !isMobile || images.length >= BOOSTER_MAX_IMAGE_COUNT
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        📷 Appareil iNrCy Google Business
                      </button>
                    </span>
                  </div>
                </div>
              ) : null}
              <ChannelImageAdapterCardsPanel
                tabs={imageAdapterTabs}
                activeChannel={activeImageChannel}
                onActiveChannelChange={(key) =>
                  setSynchronizedActiveChannel(key as ChannelKey)
                }
                channelTitle={getImageAdapterLabel(activeImageChannel)}
                formatLabel={
                  activeImageChannel === "inrcy_site" ||
                  activeImageChannel === "site_web"
                    ? "Rendu site / iframe"
                    : `Format final : ${CHANNEL_PRESETS[activeImageChannel].width}×${CHANNEL_PRESETS[activeImageChannel].height}`
                }
                aspectRatio={previewAspectRatio}
                items={imageKeys.map((key, index) => {
                  const selectedKeysForActiveChannel =
                    channelImageEditors[activeImageChannel]?.imageKeys || [];
                  const included = selectedKeysForActiveChannel.includes(key);
                  const usedChannelCount = selectedChannels.filter((channel) =>
                    (channelImageEditors[channel]?.imageKeys || []).includes(key),
                  ).length;
                  const disabledByGoogleBusinessLimit =
                    activeImageChannel === "gmb" &&
                    selectedKeysForActiveChannel.length >= 1 &&
                    !included;
                  const transform =
                    channelImageEditors[activeImageChannel]?.transforms?.[key] ||
                    getOptimizedTransform(activeImageChannel, imageMetaByKey[key]);
                  const bgMode = getBackgroundMode(transform);
                  return {
                    key,
                    previewUrl: previewByKey[key],
                    included,
                    disabled: disabledByGoogleBusinessLimit,
                    title: `Image ${index + 1}`,
                    subtitle: disabledByGoogleBusinessLimit
                      ? "Une seule photo par publication Google Business"
                      : included
                        ? `Publiée sur ce canal · utilisée sur ${usedChannelCount} canal${usedChannelCount > 1 ? "aux" : ""}`
                        : `Retirée de ce canal · utilisée sur ${usedChannelCount} canal${usedChannelCount > 1 ? "aux" : ""}`,
                    fitLabel: transform.fit === "cover" ? "Remplir" : "Adapter",
                    backgroundMode: bgMode,
                    backgroundColor: transform.backgroundColor,
                    transform,
                    preset: CHANNEL_PRESETS[activeImageChannel],
                    imageMeta: imageMetaByKey[key],
                    onToggle: () => toggleChannelImage(activeImageChannel, key),
                    onAdapt: () => openImageEditor(activeImageChannel, key),
                    onReset: () => resetChannelImage(activeImageChannel, key),
                    onRemove: included
                      ? () => toggleChannelImage(activeImageChannel, key)
                      : undefined,
                    onRemoveEverywhere: () => removeImage(index),
                    onMovePrevious:
                      included && selectedKeysForActiveChannel.indexOf(key) > 0
                        ? () => moveChannelImage(activeImageChannel, key, -1)
                        : undefined,
                    onMoveNext:
                      included &&
                      selectedKeysForActiveChannel.indexOf(key) >= 0 &&
                      selectedKeysForActiveChannel.indexOf(key) <
                        selectedKeysForActiveChannel.length - 1
                        ? () => moveChannelImage(activeImageChannel, key, 1)
                        : undefined,
                  };
                })}
                buttonClassName={styles.secondaryBtn}
                pillButtonStyle={pillBtn}
                pillButtonActiveStyle={pillBtnActive}
                showTabs={false}
              />
            </>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Sélectionnez d’abord vos canaux.
        </div>
      )}
    </div>
  );
}
