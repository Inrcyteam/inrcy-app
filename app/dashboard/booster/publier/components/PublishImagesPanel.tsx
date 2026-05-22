import type { MutableRefObject } from "react";
import { ChannelImageAdapterCardsPanel } from "@/app/dashboard/_components/ChannelImageAdapterTool";
import {
  CHANNEL_PRESETS,
  getBackgroundMode,
  getOptimizedTransform,
  type ChannelImageEditorState,
  type ChannelKey,
  type ImageMeta,
} from "../publishModal.shared";
import { pillBtn, pillBtnActive } from "../publishModal.styles";

type PublishModalStyles = Readonly<Record<string, string>>;

type ImageAdapterTab = {
  key: ChannelKey;
  label: string;
  count: number;
  tone: "ready" | "warning";
};

type PublishImagesPanelProps = {
  styles: PublishModalStyles;
  images: File[];
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
  onImagesChange: (files: FileList | null, preferredChannel?: ChannelKey) => void;
  gmbFileInputRef: MutableRefObject<HTMLInputElement | null>;
  setImgError: (message: string) => void;
  toggleChannelImage: (channel: ChannelKey, imageKey: string) => void;
  openImageEditor: (channel: ChannelKey, imageKey: string) => void;
  resetChannelImage: (channel: ChannelKey, imageKey: string) => void;
  removeImage: (index: number) => void;
  moveChannelImage: (channel: ChannelKey, imageKey: string, direction: -1 | 1) => void;
};

export default function PublishImagesPanel({
  styles,
  images,
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
  onImagesChange,
  gmbFileInputRef,
  setImgError,
  toggleChannelImage,
  openImageEditor,
  resetChannelImage,
  removeImage,
  moveChannelImage,
}: PublishImagesPanelProps) {
  const publicationImagesPanelVisible = true;

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
        <div className={styles.blockTitle}>Images de la publication</div>
      </div>
      <div
        className={styles.subtitle}
        style={{ marginBottom: 12, maxWidth: "none", whiteSpace: "normal" }}
      >
        Ajoutez vos images, puis ajustez-les par canal. Google Business : 1 photo maximum.
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
          disabled={images.length >= 5}
          title={images.length >= 5 ? "5 images maximum" : undefined}
          style={{
            opacity: images.length >= 5 ? 0.48 : 1,
            filter: images.length >= 5 ? "grayscale(1)" : undefined,
            cursor: images.length >= 5 ? "not-allowed" : "pointer",
          }}
        >
          + Ajouter des images
        </button>
        {images.length ? (
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {images.length}/5 image{images.length === 1 ? "" : "s"} ajoutée{images.length === 1 ? "" : "s"}
          </div>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.7 }}>Aucune image ajoutée</div>
        )}
      </div>
      {imgError ? (
        <div style={{ marginBottom: 10, fontSize: 13, color: "#ffb4b4" }}>
          {imgError}
        </div>
      ) : null}
      {publicationImagesPanelVisible ? !selectedChannels.length ? (
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Sélectionnez d’abord vos canaux.
        </div>
      ) : !images.length ? (
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Ajoutez une ou plusieurs images. Elles apparaîtront directement dans les onglets des canaux.
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
              <div style={{ fontSize: 13, lineHeight: 1.5, color: "#fde68a" }}>
                <strong>Google Business : 1 seule photo par publication.</strong>{" "}
                Les autres images restent disponibles sur les autres canaux.
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    setImgError("");
                    if (images.length >= 5) return;
                    gmbFileInputRef.current?.click();
                  }}
                  disabled={images.length >= 5}
                  title={images.length >= 5 ? "5 images maximum" : undefined}
                  style={{
                    opacity: images.length >= 5 ? 0.48 : 1,
                    filter: images.length >= 5 ? "grayscale(1)" : undefined,
                    cursor: images.length >= 5 ? "not-allowed" : "pointer",
                  }}
                >
                  + Ajouter une image spécifique Google Business
                </button>
              </div>
            </div>
          ) : null}
          <ChannelImageAdapterCardsPanel
            tabs={imageAdapterTabs}
            activeChannel={activeImageChannel}
            onActiveChannelChange={(key) => setSynchronizedActiveChannel(key as ChannelKey)}
            channelTitle={getImageAdapterLabel(activeImageChannel)}
            formatLabel={
              activeImageChannel === "inrcy_site" || activeImageChannel === "site_web"
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
                onRemove: included ? () => toggleChannelImage(activeImageChannel, key) : undefined,
                onRemoveEverywhere: () => removeImage(index),
                onMovePrevious:
                  included && selectedKeysForActiveChannel.indexOf(key) > 0
                    ? () => moveChannelImage(activeImageChannel, key, -1)
                    : undefined,
                onMoveNext:
                  included &&
                  selectedKeysForActiveChannel.indexOf(key) >= 0 &&
                  selectedKeysForActiveChannel.indexOf(key) < selectedKeysForActiveChannel.length - 1
                    ? () => moveChannelImage(activeImageChannel, key, 1)
                    : undefined,
              };
            })}
            buttonClassName={styles.secondaryBtn}
            pillButtonStyle={pillBtn}
            pillButtonActiveStyle={pillBtnActive}
          />
        </>
      ) : null}
    </div>
  );
}
