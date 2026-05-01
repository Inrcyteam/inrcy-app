import React from "react";
import { ChannelImageAdapterModal } from "@/app/dashboard/_components/ChannelImageAdapterTool";
import styles from "../mails.module.css";
import {
  buildPublicationDefaultTransform,
  computePublicationPreviewLayout,
  formatChannelLabel,
  getPublicationBackgroundMode,
  getPublicationChannelPreset,
  offsetFromPublicationDrawPosition,
  publicationClamp,
  withPublicationBackgroundMode,
} from "../_lib/mailboxPhase1";
import { pillBtn, pillBtnActive } from "./mailboxInlineStyles";

type MailboxPublicationImageAdapterModalProps = {
  open: boolean;
  detailsEditMode: boolean;
  publicationImageAdapterAsset: any | null;
  publicationImageAdapterChannelKey: string | null;
  publicationImageAdapterStageRef: React.RefObject<HTMLDivElement | null>;
  publicationImageAdapterStageSize: { width: number; height: number };
  publicationImageAdapterImageMeta: Record<string, { width: number; height: number }>;
  isPublicationImageAdapterDragging: boolean;
  publicationEditImagesByChannel: Record<string, { assets: any[] }>;
  setPublicationImageAdapterImageKey: React.Dispatch<React.SetStateAction<string | null>>;
  publicationImageAdapterDragRef: React.MutableRefObject<any>;
  setIsPublicationImageAdapterDragging: React.Dispatch<React.SetStateAction<boolean>>;
  updatePublicationChannelAssets: (channel: string, updater: (assets: any[]) => any[]) => void;
  closePublicationImageAdapter: () => void;
};

export default function MailboxPublicationImageAdapterModal(props: MailboxPublicationImageAdapterModalProps) {
  const {
    open,
    detailsEditMode,
    publicationImageAdapterAsset,
    publicationImageAdapterChannelKey,
    publicationImageAdapterStageRef,
    publicationImageAdapterStageSize,
    publicationImageAdapterImageMeta,
    isPublicationImageAdapterDragging,
    publicationEditImagesByChannel,
    setPublicationImageAdapterImageKey,
    publicationImageAdapterDragRef,
    setIsPublicationImageAdapterDragging,
    updatePublicationChannelAssets,
    closePublicationImageAdapter,
  } = props;

  if (!open || !detailsEditMode || !publicationImageAdapterAsset || !publicationImageAdapterChannelKey) return null;

  const channel = publicationImageAdapterChannelKey;
  const preset = getPublicationChannelPreset(channel);
  const transform = publicationImageAdapterAsset.transform;
  const imageMeta = publicationImageAdapterImageMeta[publicationImageAdapterAsset.key];
  const previewLayout = computePublicationPreviewLayout({
    containerWidth: publicationImageAdapterStageSize.width,
    containerHeight: publicationImageAdapterStageSize.height,
    imageWidth: imageMeta?.width || 0,
    imageHeight: imageMeta?.height || 0,
    transform,
  });
  const backgroundMode = getPublicationBackgroundMode(transform);
  const zoomLabel = `zoom ${Number(transform.zoom || 1).toFixed(2)}×`;

  return (
    <ChannelImageAdapterModal
              open
              title={`Adapter ${publicationImageAdapterAsset.name}`}
              subtitle={`${formatChannelLabel(channel)} • ${preset.width}×${preset.height}`}
              aspectRatio={`${preset.width} / ${preset.height}`}
              backgroundMode={backgroundMode}
              backgroundColor={publicationImageAdapterAsset.transform.backgroundColor}
              fitLabel={transform.fit === "cover" ? "Remplir" : "Adapter"}
              zoomLabel={zoomLabel}
              previewSrc={publicationImageAdapterAsset.previewUrl}
              previewLayout={previewLayout}
              previewRef={publicationImageAdapterStageRef}
              isDragging={isPublicationImageAdapterDragging}
              onClose={closePublicationImageAdapter}
              buttonClassName={styles.btnGhost}
              primaryButtonClassName={styles.btnPrimary}
              onWheel={(event) => {
                if (!publicationImageAdapterStageRef.current || !imageMeta?.width || !imageMeta?.height) return;
                if (event.cancelable) event.preventDefault();
                const rect = publicationImageAdapterStageRef.current.getBoundingClientRect();
                const pointerX = event.clientX - rect.left;
                const pointerY = event.clientY - rect.top;
                const nextZoom = publicationClamp((transform.zoom || 1) + (event.deltaY < 0 ? 0.08 : -0.08), 0.4, 3);
                const nextLayout = computePublicationPreviewLayout({
                  containerWidth: rect.width,
                  containerHeight: rect.height,
                  imageWidth: imageMeta.width,
                  imageHeight: imageMeta.height,
                  transform: { ...transform, zoom: nextZoom },
                });
                const currentDrawW = previewLayout.drawW || nextLayout.drawW;
                const currentDrawH = previewLayout.drawH || nextLayout.drawH;
                const ux = currentDrawW ? (pointerX - previewLayout.dx) / currentDrawW : 0.5;
                const uy = currentDrawH ? (pointerY - previewLayout.dy) / currentDrawH : 0.5;
                const nextDx = pointerX - ux * nextLayout.drawW;
                const nextDy = pointerY - uy * nextLayout.drawH;
                const offsets = offsetFromPublicationDrawPosition({
                  containerWidth: rect.width,
                  containerHeight: rect.height,
                  drawW: nextLayout.drawW,
                  drawH: nextLayout.drawH,
                  dx: nextDx,
                  dy: nextDy,
                });
                updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationImageAdapterAsset.key ? { ...asset, transform: { ...asset.transform, zoom: nextZoom, ...offsets } } : asset));
              }}
              onPointerDown={(event) => {
                publicationImageAdapterDragRef.current = {
                  channel,
                  imageKey: publicationImageAdapterAsset.key,
                  startX: event.clientX,
                  startY: event.clientY,
                  startOffsetX: transform.offsetX || 0,
                  startOffsetY: transform.offsetY || 0,
                };
                setIsPublicationImageAdapterDragging(true);
                event.currentTarget.setPointerCapture?.(event.pointerId);
              }}
              onPointerMove={(event) => {
                const drag = publicationImageAdapterDragRef.current;
                if (!drag || drag.imageKey !== publicationImageAdapterAsset.key) return;
                const maxX = Math.abs(previewLayout.drawW - publicationImageAdapterStageSize.width) / 2;
                const maxY = Math.abs(previewLayout.drawH - publicationImageAdapterStageSize.height) / 2;
                const nextOffsetX = maxX ? publicationClamp(drag.startOffsetX - ((event.clientX - drag.startX) / maxX) * 100, -100, 100) : 0;
                const nextOffsetY = maxY ? publicationClamp(drag.startOffsetY - ((event.clientY - drag.startY) / maxY) * 100, -100, 100) : 0;
                updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationImageAdapterAsset.key ? { ...asset, transform: { ...asset.transform, offsetX: nextOffsetX, offsetY: nextOffsetY } } : asset));
              }}
              onPointerUp={(event) => {
                if (publicationImageAdapterDragRef.current) {
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
                }
                publicationImageAdapterDragRef.current = null;
                setIsPublicationImageAdapterDragging(false);
              }}
              onPointerCancel={(event) => {
                if (publicationImageAdapterDragRef.current) {
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
                }
                publicationImageAdapterDragRef.current = null;
                setIsPublicationImageAdapterDragging(false);
              }}
              onZoomOut={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationImageAdapterAsset.key ? { ...asset, transform: { ...asset.transform, zoom: publicationClamp((asset.transform.zoom || 1) - 0.08, 0.4, 3) } } : asset))}
              onZoomIn={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationImageAdapterAsset.key ? { ...asset, transform: { ...asset.transform, zoom: publicationClamp((asset.transform.zoom || 1) + 0.08, 0.4, 3) } } : asset))}
              onContain={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationImageAdapterAsset.key ? { ...asset, transform: withPublicationBackgroundMode({ ...asset.transform, fit: "contain", zoom: 1, offsetX: 0, offsetY: 0 }, getPublicationBackgroundMode(asset.transform)) } : asset))}
              onCover={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationImageAdapterAsset.key ? { ...asset, transform: withPublicationBackgroundMode({ ...asset.transform, fit: "cover", zoom: 1, offsetX: 0, offsetY: 0 }, "black") } : asset))}
              onReset={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationImageAdapterAsset.key ? { ...asset, transform: buildPublicationDefaultTransform(channel) } : asset))}
              onDoubleClick={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationImageAdapterAsset.key ? { ...asset, transform: { ...asset.transform, offsetX: 0, offsetY: 0 } } : asset))}
              onSave={closePublicationImageAdapter}
              onApplyToChannelImages={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.selected ? { ...asset, transform: { ...transform } } : asset))}
              onResetChannel={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.selected ? { ...asset, transform: buildPublicationDefaultTransform(channel) } : asset))}
              isolationNote={`Ce réglage concerne uniquement ${formatChannelLabel(channel)}. Les autres canaux restent indépendants.`}
              onBackgroundModeChange={(mode) => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationImageAdapterAsset.key ? { ...asset, transform: mode === "blur" ? withPublicationBackgroundMode({ ...asset.transform, fit: "contain" }, "blur") : mode === "transparent" ? withPublicationBackgroundMode({ ...asset.transform, fit: "contain" }, "transparent") : { ...withPublicationBackgroundMode({ ...asset.transform, fit: "contain" }, "color"), backgroundColor: asset.transform.backgroundColor || "#e8f6ff" } } : asset))}
              onBackgroundColorChange={(color) => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationImageAdapterAsset.key ? { ...asset, transform: { ...withPublicationBackgroundMode({ ...asset.transform, fit: "contain" }, "color"), backgroundColor: color } } : asset))}
              pillButtonStyle={pillBtn}
              pillButtonActiveStyle={pillBtnActive}
              sidebarItems={(publicationEditImagesByChannel[channel]?.assets || []).map((asset, index) => ({
                key: asset.key,
                previewUrl: asset.previewUrl,
                title: `Image ${index + 1}`,
                subtitle: asset.selected ? "Publiée sur ce canal" : "Non publiée sur ce canal",
                active: asset.key === publicationImageAdapterAsset.key,
                onClick: () => setPublicationImageAdapterImageKey(asset.key),
              }))}
            />
  );
}
