import React from "react";
import { ChannelImageRetouchModal } from "@/app/dashboard/_components/ChannelImageRetouchTool";
import styles from "../mails.module.css";
import {
  buildPublicationDefaultTransform,
  computePublicationPreviewLayout,
  formatChannelLabel,
  getPublicationBackgroundMode,
  getPublicationChannelPreset,
  getPublicationDesign,
  offsetFromPublicationDrawPosition,
  publicationClamp,
  withPublicationBackgroundMode,
} from "../_lib/mailboxPhase1";
import { pillBtn, pillBtnActive } from "./mailboxInlineStyles";

type MailboxPublicationRetouchModalProps = {
  open: boolean;
  detailsEditMode: boolean;
  publicationRetouchAsset: any | null;
  publicationRetouchChannelKey: string | null;
  publicationRetouchStageRef: React.RefObject<HTMLDivElement | null>;
  publicationRetouchStageSize: { width: number; height: number };
  publicationRetouchImageMeta: Record<string, { width: number; height: number }>;
  isPublicationRetouchDragging: boolean;
  publicationEditImagesByChannel: Record<string, { assets: any[] }>;
  setPublicationRetouchImageKey: React.Dispatch<React.SetStateAction<string | null>>;
  publicationRetouchDragRef: React.MutableRefObject<any>;
  setIsPublicationRetouchDragging: React.Dispatch<React.SetStateAction<boolean>>;
  updatePublicationChannelAssets: (channel: string, updater: (assets: any[]) => any[]) => void;
  closePublicationRetouch: () => void;
};

export default function MailboxPublicationRetouchModal(props: MailboxPublicationRetouchModalProps) {
  const {
    open,
    detailsEditMode,
    publicationRetouchAsset,
    publicationRetouchChannelKey,
    publicationRetouchStageRef,
    publicationRetouchStageSize,
    publicationRetouchImageMeta,
    isPublicationRetouchDragging,
    publicationEditImagesByChannel,
    setPublicationRetouchImageKey,
    publicationRetouchDragRef,
    setIsPublicationRetouchDragging,
    updatePublicationChannelAssets,
    closePublicationRetouch,
  } = props;

  if (!open || !detailsEditMode || !publicationRetouchAsset || !publicationRetouchChannelKey) return null;

  const channel = publicationRetouchChannelKey;
  const preset = getPublicationChannelPreset(channel);
  const transform = publicationRetouchAsset.transform;
  const imageMeta = publicationRetouchImageMeta[publicationRetouchAsset.key];
  const previewLayout = computePublicationPreviewLayout({
    containerWidth: publicationRetouchStageSize.width,
    containerHeight: publicationRetouchStageSize.height,
    imageWidth: imageMeta?.width || 0,
    imageHeight: imageMeta?.height || 0,
    transform,
  });
  const backgroundMode = getPublicationBackgroundMode(transform);
  const zoomLabel = `zoom ${Number(transform.zoom || 1).toFixed(2)}×`;

  return (
    <ChannelImageRetouchModal
              open
              title={`Retoucher ${publicationRetouchAsset.name}`}
              subtitle={`${formatChannelLabel(channel)} • ${preset.width}×${preset.height}`}
              aspectRatio={`${preset.width} / ${preset.height}`}
              backgroundMode={backgroundMode}
              backgroundColor={publicationRetouchAsset.transform.backgroundColor}
              fitLabel={transform.fit === "cover" ? "Remplir" : "Adapter"}
              zoomLabel={zoomLabel}
              previewSrc={publicationRetouchAsset.previewUrl}
              previewLayout={previewLayout}
              previewRef={publicationRetouchStageRef}
              isDragging={isPublicationRetouchDragging}
              onClose={closePublicationRetouch}
              buttonClassName={styles.btnGhost}
              primaryButtonClassName={styles.btnPrimary}
              onWheel={(event) => {
                if (!publicationRetouchStageRef.current || !imageMeta?.width || !imageMeta?.height) return;
                event.preventDefault();
                const rect = publicationRetouchStageRef.current.getBoundingClientRect();
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
                updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, zoom: nextZoom, ...offsets } } : asset));
              }}
              onPointerDown={(event) => {
                publicationRetouchDragRef.current = {
                  channel,
                  imageKey: publicationRetouchAsset.key,
                  startX: event.clientX,
                  startY: event.clientY,
                  startOffsetX: transform.offsetX || 0,
                  startOffsetY: transform.offsetY || 0,
                };
                setIsPublicationRetouchDragging(true);
                event.currentTarget.setPointerCapture?.(event.pointerId);
              }}
              onPointerMove={(event) => {
                const drag = publicationRetouchDragRef.current;
                if (!drag || drag.imageKey !== publicationRetouchAsset.key) return;
                const maxX = Math.abs(previewLayout.drawW - publicationRetouchStageSize.width) / 2;
                const maxY = Math.abs(previewLayout.drawH - publicationRetouchStageSize.height) / 2;
                const nextOffsetX = maxX ? publicationClamp(drag.startOffsetX - ((event.clientX - drag.startX) / maxX) * 100, -100, 100) : 0;
                const nextOffsetY = maxY ? publicationClamp(drag.startOffsetY - ((event.clientY - drag.startY) / maxY) * 100, -100, 100) : 0;
                updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, offsetX: nextOffsetX, offsetY: nextOffsetY } } : asset));
              }}
              onPointerUp={(event) => {
                if (publicationRetouchDragRef.current) {
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
                }
                publicationRetouchDragRef.current = null;
                setIsPublicationRetouchDragging(false);
              }}
              onPointerCancel={(event) => {
                if (publicationRetouchDragRef.current) {
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
                }
                publicationRetouchDragRef.current = null;
                setIsPublicationRetouchDragging(false);
              }}
              onZoomOut={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, zoom: publicationClamp((asset.transform.zoom || 1) - 0.08, 0.4, 3) } } : asset))}
              onZoomIn={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, zoom: publicationClamp((asset.transform.zoom || 1) + 0.08, 0.4, 3) } } : asset))}
              onContain={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: withPublicationBackgroundMode({ ...asset.transform, fit: "contain", zoom: 1, offsetX: 0, offsetY: 0 }, getPublicationBackgroundMode(asset.transform)) } : asset))}
              onCover={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: withPublicationBackgroundMode({ ...asset.transform, fit: "cover", zoom: 1, offsetX: 0, offsetY: 0 }, "black") } : asset))}
              onReset={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: buildPublicationDefaultTransform(channel) } : asset))}
              onDoubleClick={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, offsetX: 0, offsetY: 0 } } : asset))}
              onSave={closePublicationRetouch}
              onBackgroundModeChange={(mode) => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: mode === "blur" ? withPublicationBackgroundMode({ ...asset.transform, fit: "contain" }, "blur") : mode === "transparent" ? withPublicationBackgroundMode({ ...asset.transform, fit: "contain" }, "transparent") : { ...withPublicationBackgroundMode({ ...asset.transform, fit: "contain" }, "color"), backgroundColor: asset.transform.backgroundColor || "#e8f6ff" } } : asset))}
              onBackgroundColorChange={(color) => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...withPublicationBackgroundMode({ ...asset.transform, fit: "contain" }, "color"), backgroundColor: color } } : asset))}
              designState={getPublicationDesign(publicationRetouchAsset.transform)}
              onDesignChange={(patch) => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, design: { ...getPublicationDesign(asset.transform), ...patch } } } : asset))}
              pillButtonStyle={pillBtn}
              pillButtonActiveStyle={pillBtnActive}
              sidebarItems={(publicationEditImagesByChannel[channel]?.assets || []).map((asset, index) => ({
                key: asset.key,
                previewUrl: asset.previewUrl,
                title: `Image ${index + 1}`,
                subtitle: asset.selected ? "Publiée sur ce canal" : "Non publiée sur ce canal",
                active: asset.key === publicationRetouchAsset.key,
                onClick: () => setPublicationRetouchImageKey(asset.key),
              }))}
            />
  );
}
