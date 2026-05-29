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
  publicationMediaType,
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
  const publicationImagesPanelVisible = true;
  const hasImages = images.length > 0;
  const hasVideoMedia = publicationMediaType === "video" && Boolean(videoFile || videoPreviewUrl);
  const imagesDisabledByVideo = hasVideoMedia;
  const videoDisabledByImages = hasImages;
  const imagesLimitReached = publicationMediaType === "images" && images.length >= BOOSTER_MAX_IMAGE_COUNT;
  const pickImagesDisabled = imagesDisabledByVideo || imagesLimitReached;
  const pickVideoDisabled = videoDisabledByImages;
  const cameraDisabled = !isMobile || hasVideoMedia || imagesLimitReached;

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
          marginBottom: publicationImagesPanelVisible ? 12 : 0,
        }}
      >
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onPickImagesClick}
          disabled={pickImagesDisabled}
          title={
            imagesDisabledByVideo
              ? "Supprimez la vidéo pour ajouter des images."
              : imagesLimitReached
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
              ? "Supprimez les images pour ajouter une vidéo."
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
              : hasVideoMedia
                ? "Supprimez la vidéo pour reprendre une photo."
                : imagesLimitReached
                  ? `${BOOSTER_MAX_IMAGE_COUNT} images maximum`
                  : hasImages
                    ? "Ouvrir l’Appareil iNrCy en mode photo"
                    : "Ouvrir l’Appareil iNrCy pour prendre une photo ou une vidéo"
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
        {publicationMediaType === "video" && videoFile ? (
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            1 vidéo ajoutée · IA vidéo + audio · {BOOSTER_MAX_VIDEO_MB_LABEL} max · {BOOSTER_RECOMMENDED_VIDEO_DURATION_LABEL}
          </div>
        ) : images.length ? (
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {images.length}/{BOOSTER_MAX_IMAGE_COUNT} image
            {images.length === 1 ? "" : "s"} ajoutée
            {images.length === 1 ? "" : "s"}
          </div>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.7 }}>Aucun média ajouté</div>
        )}
      </div>
      {imgError ? (
        <div style={{ marginBottom: 10, fontSize: 13, color: "#ffb4b4" }}>
          {imgError}
        </div>
      ) : null}
      {publicationImagesPanelVisible ? (
        publicationMediaType === "video" && videoFile ? (
          <div
            style={{
              display: isMobile ? "grid" : "flex",
              alignItems: "center",
              justifyContent: isMobile ? "center" : "flex-start",
              gap: isMobile ? 10 : 12,
              borderRadius: 16,
              padding: 12,
              border: "1px solid rgba(76,195,255,0.22)",
              background: "rgba(76,195,255,0.08)",
              maxWidth: "100%",
            }}
          >
            {videoPreviewUrl ? (
              <video
                src={videoPreviewUrl}
                controls
                playsInline
                style={{
                  width: isMobile ? "min(100%, 260px)" : 260,
                  maxWidth: "100%",
                  height: "auto",
                  maxHeight: isMobile ? 150 : 150,
                  objectFit: "contain",
                  borderRadius: 12,
                  background: "#050816",
                  display: "block",
                  boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
                }}
              />
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
                  maxWidth: isMobile ? 260 : 320,
                  overflowWrap: "anywhere",
                }}
              >
                {videoFile.name}
              </strong>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: isMobile ? "center" : "flex-start",
                  gap: 7,
                  flexWrap: "wrap",
                  fontSize: isMobile ? 11 : 12,
                  opacity: 0.78,
                }}
              >
                {formatVideoSeconds(videoDurationSeconds) ? (
                  <span>{formatVideoSeconds(videoDurationSeconds)}</span>
                ) : null}
                <span>{BOOSTER_MAX_VIDEO_MB_LABEL} max</span>
                <span>{BOOSTER_RECOMMENDED_VIDEO_DURATION_LABEL}</span>
                <span>IA : captures + audio</span>
              </div>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={removeVideo}
                style={{ minHeight: 30, padding: "5px 10px", fontSize: 11 }}
              >
                Supprimer
              </button>
            </div>
          </div>
        ) : !selectedChannels.length ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Sélectionnez d’abord vos canaux.
          </div>
        ) : !images.length ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Ajoutez une ou plusieurs images. Elles apparaîtront directement dans
            les onglets des canaux.
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
                  style={{ fontSize: 13, lineHeight: 1.5, color: "#fde68a" }}
                >
                  <strong>
                    Google Business : 1 seule photo par publication.
                  </strong>{" "}
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
                      opacity:
                        images.length >= BOOSTER_MAX_IMAGE_COUNT ? 0.48 : 1,
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
                              if (images.length >= BOOSTER_MAX_IMAGE_COUNT)
                                return;
                              onTakePhotoClick("gmb");
                            }
                          : undefined
                      }
                      disabled={
                        isMobile && images.length >= BOOSTER_MAX_IMAGE_COUNT
                      }
                      aria-disabled={
                        !isMobile || images.length >= BOOSTER_MAX_IMAGE_COUNT
                      }
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
                  getOptimizedTransform(
                    activeImageChannel,
                    imageMetaByKey[key],
                  );
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
            />
          </>
        )
      ) : null}
    </div>
  );
}
