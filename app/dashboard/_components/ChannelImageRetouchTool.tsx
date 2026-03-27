import React, { useEffect, useMemo, useRef } from "react";
import ImageMiniDesignPanel, { MiniDesignState } from "./ImageMiniDesignPanel";

type BackgroundMode = "blur" | "transparent" | "color" | "white" | "black" | "gray" | "sand" | "brand";

type ChannelTab = { key: string; label: string };

type CardItem = {
  key: string;
  previewUrl: string;
  included: boolean;
  title: string;
  subtitle: string;
  fitLabel: string;
  backgroundMode: BackgroundMode;
  onToggle: () => void;
  onRetouch: () => void;
  onRemove?: () => void;
};

type SidebarItem = {
  key: string;
  previewUrl: string;
  title: string;
  subtitle: string;
  active: boolean;
  onClick: () => void;
};

type CardsPanelProps = {
  tabs: ChannelTab[];
  activeChannel: string;
  onActiveChannelChange: (key: string) => void;
  channelTitle: string;
  formatLabel: string;
  aspectRatio: string;
  items: CardItem[];
  buttonClassName: string;
  pillButtonStyle: React.CSSProperties;
  pillButtonActiveStyle: React.CSSProperties;
  showTabs?: boolean;
  emptyMessage?: string;
};

type ModalProps = {
  open: boolean;
  title: string;
  subtitle: string;
  aspectRatio: string;
  backgroundMode: BackgroundMode;
  backgroundColor?: string;
  fitLabel: string;
  zoomLabel: string;
  previewSrc: string;
  previewImageStyle?: React.CSSProperties;
  previewLayout?: { drawW: number; drawH: number; dx: number; dy: number };
  isDragging?: boolean;
  onClose: () => void;
  onWheel?: React.WheelEventHandler<HTMLDivElement>;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  onPointerMove?: React.PointerEventHandler<HTMLDivElement>;
  onPointerUp?: React.PointerEventHandler<HTMLDivElement>;
  onPointerCancel?: React.PointerEventHandler<HTMLDivElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLDivElement>;
  previewRef?: React.RefObject<HTMLDivElement | null>;
  onImageMouseDown?: React.MouseEventHandler<HTMLImageElement>;
  buttonClassName: string;
  primaryButtonClassName?: string;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onContain: () => void;
  onCover: () => void;
  onReset: () => void;
  onSave: () => void;
  onApplyToSelectedChannels?: () => void;
  onBackgroundModeChange: (mode: BackgroundMode) => void;
  onBackgroundColorChange?: (color: string) => void;
  pillButtonStyle: React.CSSProperties;
  pillButtonActiveStyle: React.CSSProperties;
  sidebarItems?: SidebarItem[];
  designState?: MiniDesignState;
  onDesignChange?: (patch: Partial<MiniDesignState>) => void;
};

const CARD_WIDTH = 220;
const CHECKERBOARD = "linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.08) 75%, rgba(255,255,255,0.08)), linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.08) 75%, rgba(255,255,255,0.08))";

function legacyColorFromMode(mode: BackgroundMode, backgroundColor?: string) {
  if (backgroundColor) return backgroundColor;
  switch (mode) {
    case "white": return "#ffffff";
    case "black": return "#0d1320";
    case "gray": return "#d6dae2";
    case "sand": return "#efe4d3";
    case "brand": return "#e8f6ff";
    default: return "#e8f6ff";
  }
}

function normalizedMode(mode: BackgroundMode): "blur" | "transparent" | "color" {
  if (mode === "blur") return "blur";
  if (mode === "transparent") return "transparent";
  return "color";
}

function previewBackgroundStyle(mode: BackgroundMode, backgroundColor?: string): React.CSSProperties {
  const normalized = normalizedMode(mode);
  if (normalized === "transparent") {
    return {
      backgroundColor: "#0d1320",
      backgroundImage: CHECKERBOARD,
      backgroundSize: "24px 24px",
      backgroundPosition: "0 0, 12px 12px",
    };
  }
  if (normalized === "color") {
    return { background: legacyColorFromMode(mode, backgroundColor) };
  }
  return { background: "#0d1320" };
}

function getTextBoxPosition(designState?: MiniDesignState) {
  const x = Math.max(6, Math.min(94, designState?.x ?? 50));
  const fallbackY = designState?.position === "top" ? 12 : designState?.position === "center" ? 50 : 88;
  const y = Math.max(8, Math.min(92, designState?.y ?? fallbackY));
  return { x, y };
}

export function ChannelImageRetouchCardsPanel({
  tabs,
  activeChannel,
  onActiveChannelChange,
  channelTitle,
  formatLabel,
  aspectRatio,
  items,
  buttonClassName,
  pillButtonStyle,
  pillButtonActiveStyle,
  showTabs = true,
  emptyMessage,
}: CardsPanelProps) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {showTabs ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", overflowX: "auto" }}>
          {tabs.map((tab) => (
            <button key={tab.key} type="button" onClick={() => onActiveChannelChange(tab.key)} style={{ ...pillButtonStyle, ...(activeChannel === tab.key ? pillButtonActiveStyle : {}) }}>
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 18, padding: 14, background: "rgba(255,255,255,0.03)", display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>{channelTitle}</div>
          <div style={{ fontSize: 12, opacity: 0.78 }}>{formatLabel}</div>
        </div>

        {items.length ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "stretch" }}>
            {items.map((item) => (
              <div
                key={item.key}
                style={{
                  width: CARD_WIDTH,
                  minWidth: CARD_WIDTH,
                  maxWidth: CARD_WIDTH,
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 18,
                  padding: 10,
                  background: item.included ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.025)",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", aspectRatio, ...previewBackgroundStyle(item.backgroundMode), border: "1px solid rgba(255,255,255,0.08)" }}>
                  <img src={item.previewUrl} alt={item.title} style={{ width: "100%", height: "100%", objectFit: item.fitLabel === "Remplir" ? "cover" : "contain", display: "block" }} />
                  <div style={{ position: "absolute", left: 8, bottom: 8, fontSize: 11, padding: "5px 8px", borderRadius: 999, background: "rgba(6,10,20,0.72)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}>
                    {item.fitLabel}
                  </div>
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  <input type="checkbox" checked={item.included} onChange={item.onToggle} style={{ width: 16, height: 16, accentColor: "#4cc3ff" }} />
                  <span>{item.title}</span>
                </label>

                <div style={{ fontSize: 11, opacity: 0.68 }}>{item.subtitle}</div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className={buttonClassName} onClick={item.onRetouch} style={{ flex: 1, justifyContent: "center" }}>
                    Retoucher
                  </button>
                  {item.onRemove ? (
                    <button type="button" className={buttonClassName} onClick={item.onRemove} aria-label={`Retirer ${item.title}`} style={{ minWidth: 44, justifyContent: "center", position: "relative", zIndex: 2, background: "rgba(10,14,24,0.92)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.22)", boxShadow: "0 10px 20px rgba(0,0,0,0.28)" }}>
                      ✕
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, opacity: 0.75 }}>{emptyMessage || "Aucune image"}</div>
        )}
      </div>
    </div>
  );
}

export function ChannelImageRetouchModal({
  open,
  title,
  subtitle,
  aspectRatio,
  backgroundMode,
  backgroundColor,
  fitLabel,
  zoomLabel,
  previewSrc,
  previewImageStyle,
  previewLayout,
  isDragging,
  onClose,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onDoubleClick,
  previewRef,
  onImageMouseDown,
  buttonClassName,
  primaryButtonClassName,
  onZoomOut,
  onZoomIn,
  onContain,
  onCover,
  onReset,
  onSave,
  onApplyToSelectedChannels,
  onBackgroundModeChange,
  onBackgroundColorChange,
  pillButtonStyle,
  pillButtonActiveStyle,
  sidebarItems,
  designState,
  onDesignChange,
}: ModalProps) {
  const textDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const textResizeRef = useRef<{ pointerId: number; startX: number; startY: number; originWidth: number; originHeight: number } | null>(null);
  const textBoxPos = useMemo(() => getTextBoxPosition(designState), [designState]);
  const textBoxWidth = Math.max(140, Math.min(520, designState?.width ?? 320));
  const textBoxHeight = Math.max(64, Math.min(280, designState?.height ?? Math.max(84, Math.round((designState?.size ?? 30) * 2.6))));

  useEffect(() => {
    if (!open) return;
    const onWindowPointerUp = () => {
      textDragRef.current = null;
      textResizeRef.current = null;
    };
    window.addEventListener("pointerup", onWindowPointerUp);
    return () => window.removeEventListener("pointerup", onWindowPointerUp);
  }, [open]);

  if (!open) return null;

  const hasLayout = !!previewLayout;
  const bgMode = normalizedMode(backgroundMode);
  const bgFill = legacyColorFromMode(backgroundMode, backgroundColor);
  const previewBg = previewBackgroundStyle(backgroundMode, backgroundColor);

  return (
    <div role="dialog" aria-modal="true" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10020, background: "rgba(4, 8, 18, 0.78)", backdropFilter: "blur(10px)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(event) => event.stopPropagation()} style={{ width: "min(1580px, calc(100vw - 28px))", height: "min(940px, calc(100vh - 28px))", borderRadius: 28, border: "1px solid rgba(255,255,255,0.12)", background: "linear-gradient(180deg, rgba(24,28,42,0.985), rgba(14,17,28,0.985))", boxShadow: "0 28px 100px rgba(0,0,0,0.5)", padding: 18, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 16, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 52 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 18, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
            <div style={{ fontSize: 12, opacity: 0.74, marginTop: 4 }}>{subtitle}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {onApplyToSelectedChannels ? <button type="button" className={buttonClassName} onClick={onApplyToSelectedChannels}>Appliquer partout</button> : null}
            <button type="button" className={primaryButtonClassName || buttonClassName} onClick={onSave}>Enregistrer</button>
            <button type="button" className={buttonClassName} onClick={onClose}>Fermer</button>
          </div>
        </div>

        <div style={{ minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px 320px", gap: 18, alignItems: "stretch" }}>
          <div style={{ minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "minmax(0, 1fr) auto" }}>
            <div style={{ minHeight: 0, display: "grid", placeItems: "center", borderRadius: 24, border: "1px solid rgba(255,255,255,0.10)", background: "linear-gradient(180deg, rgba(255,255,255,0.015), rgba(255,255,255,0.02))", padding: 14, overflow: "hidden" }}>
              <div
                ref={previewRef}
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                onDoubleClick={onDoubleClick}
                style={{ position: "relative", height: "100%", maxWidth: "100%", aspectRatio, borderRadius: 22, overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)", ...previewBg, cursor: isDragging ? "grabbing" : "grab", touchAction: "none", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.03)" }}
              >
                {bgMode === "blur" && fitLabel === "Adapter" ? (
                  <img src={previewSrc} alt="background-preview" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(26px) saturate(1.05) brightness(1.02)", transform: "scale(1.08)", opacity: 0.95, pointerEvents: "none", userSelect: "none" }} />
                ) : null}
                {hasLayout && previewLayout ? (
                  <img src={previewSrc} alt="preview" draggable={false} style={{ position: "absolute", left: previewLayout.dx, top: previewLayout.dy, width: previewLayout.drawW, height: previewLayout.drawH, maxWidth: "none", pointerEvents: "none", userSelect: "none" }} />
                ) : (
                  <img src={previewSrc} alt="preview" draggable={false} style={previewImageStyle} onMouseDown={onImageMouseDown} />
                )}
                {designState?.enabled && designState.text.trim() ? (
                  <div
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      if ((event.target as HTMLElement)?.dataset?.resizeHandle === "true") return;
                      textDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: textBoxPos.x, originY: textBoxPos.y };
                      (event.currentTarget as HTMLDivElement).setPointerCapture?.(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      if (!previewRef?.current || !onDesignChange) return;
                      const rect = previewRef.current.getBoundingClientRect();
                      const resize = textResizeRef.current;
                      if (resize && resize.pointerId === event.pointerId) {
                        const nextWidth = Math.max(140, Math.min(rect.width * 0.92, resize.originWidth + (event.clientX - resize.startX)));
                        const nextHeight = Math.max(54, Math.min(rect.height * 0.6, resize.originHeight + (event.clientY - resize.startY)));
                        onDesignChange({ width: nextWidth, height: nextHeight });
                        return;
                      }
                      const drag = textDragRef.current;
                      if (!drag || drag.pointerId !== event.pointerId) return;
                      const halfW = (textBoxWidth / rect.width) * 50;
                      const halfH = (textBoxHeight / rect.height) * 50;
                      const nextX = Math.max(halfW + 2, Math.min(98 - halfW, drag.originX + ((event.clientX - drag.startX) / rect.width) * 100));
                      const nextY = Math.max(halfH + 2, Math.min(98 - halfH, drag.originY + ((event.clientY - drag.startY) / rect.height) * 100));
                      const nextPosition = nextY < 30 ? "top" : nextY > 70 ? "bottom" : "center";
                      onDesignChange({ x: nextX, y: nextY, position: nextPosition });
                    }}
                    onPointerUp={(event) => {
                      textDragRef.current = null;
                      textResizeRef.current = null;
                      (event.currentTarget as HTMLDivElement).releasePointerCapture?.(event.pointerId);
                    }}
                    style={{
                      position: "absolute",
                      left: `${textBoxPos.x}%`,
                      top: `${textBoxPos.y}%`,
                      transform: "translate(-50%, -50%)",
                      width: textBoxWidth,
                      height: textBoxHeight,
                      padding: "12px 18px 14px",
                      borderRadius: 18,
                      background: `${designState.background}cc`,
                      color: designState.color,
                      fontWeight: 900,
                      fontSize: designState.size,
                      lineHeight: 1.2,
                      textAlign: "center",
                      boxShadow: "0 12px 34px rgba(0,0,0,0.22)",
                      cursor: textResizeRef.current ? "nwse-resize" : "move",
                      userSelect: "none",
                      touchAction: "none",
                      display: "grid",
                      placeItems: "center",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ maxWidth: "100%", maxHeight: "100%", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", lineHeight: 1.2, paddingBottom: 2 }}>
                      {designState.text}
                    </div>
                    <div
                      data-resize-handle="true"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        textResizeRef.current = {
                          pointerId: event.pointerId,
                          startX: event.clientX,
                          startY: event.clientY,
                          originWidth: textBoxWidth,
                          originHeight: textBoxHeight,
                        };
                        (event.currentTarget as HTMLDivElement).setPointerCapture?.(event.pointerId);
                      }}
                      onPointerUp={(event) => {
                        event.stopPropagation();
                        textResizeRef.current = null;
                        (event.currentTarget as HTMLDivElement).releasePointerCapture?.(event.pointerId);
                      }}
                      style={{
                        position: "absolute",
                        right: 8,
                        bottom: 8,
                        width: 16,
                        height: 16,
                        borderRadius: 5,
                        background: "rgba(255,255,255,0.96)",
                        border: "1px solid rgba(15,23,42,0.28)",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
                        cursor: "nwse-resize",
                      }}
                    />
                  </div>
                ) : null}
                <div style={{ position: "absolute", inset: 12, borderRadius: 16, border: "1px solid rgba(255,255,255,0.14)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.14)", pointerEvents: "none" }} />
                <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", pointerEvents: "none", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, padding: "6px 10px", borderRadius: 999, background: "rgba(6,10,20,0.72)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}>{fitLabel} • {zoomLabel}</div>
                  <div style={{ fontSize: 11, padding: "6px 10px", borderRadius: 999, background: "rgba(6,10,20,0.72)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}>Glisser • Molette • Double-clic</div>
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.72, padding: "10px 2px 0" }}>Tout tient dans cette fenêtre. Déplacez l’image, dézoomez, choisissez un fond et glissez le bloc texte directement dans le visuel.</div>
          </div>

          <div style={{ minHeight: 0, display: "grid", alignContent: "start", gap: 12 }}>
            <div style={{ display: "grid", gap: 8, padding: 14, borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
              <div style={{ fontSize: 12, opacity: 0.82 }}>Image</div>
              <div style={{ display: "grid", gridTemplateColumns: "48px 48px 1fr 1fr", gap: 8 }}>
                <button type="button" className={buttonClassName} onClick={onZoomOut} style={{ justifyContent: "center" }}>−</button>
                <button type="button" className={buttonClassName} onClick={onZoomIn} style={{ justifyContent: "center" }}>+</button>
                <button type="button" className={buttonClassName} onClick={onContain} style={{ justifyContent: "center" }}>Adapter</button>
                <button type="button" className={buttonClassName} onClick={onCover} style={{ justifyContent: "center" }}>Remplir</button>
              </div>
              <button type="button" className={buttonClassName} onClick={onReset} style={{ width: "100%", justifyContent: "center" }}>Réinitialiser</button>
            </div>

            <div style={{ display: "grid", gap: 10, padding: 14, borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
              <div style={{ fontSize: 12, opacity: 0.82 }}>Arrière-plan</div>
              <select value={bgMode} onChange={(e) => onBackgroundModeChange(e.target.value as BackgroundMode)} style={{ width: "100%", minHeight: 42, borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "#ffffff", color: "#111827", padding: "0 12px" }}>
                <option value="blur" style={{ background: "#ffffff", color: "#111827" }}>Flou</option>
                <option value="transparent" style={{ background: "#ffffff", color: "#111827" }}>Transparent</option>
                <option value="color" style={{ background: "#ffffff", color: "#111827" }}>Plein</option>
              </select>
              {bgMode === "color" ? (
                <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.82 }}>
                  <span>Couleur de fond</span>
                  <input type="color" value={bgFill} onChange={(e) => onBackgroundColorChange?.(e.target.value)} style={{ width: "100%", height: 48, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "transparent" }} />
                </label>
              ) : null}
            </div>

            {designState && onDesignChange ? <ImageMiniDesignPanel value={designState} onChange={onDesignChange} /> : null}
          </div>

          <div style={{ minHeight: 0, display: "grid", gridTemplateRows: "minmax(0, 1fr)", gap: 12 }}>
            {sidebarItems?.length ? (
              <div style={{ minHeight: 0, height: "100%", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 8, padding: 14, borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                <div style={{ fontSize: 12, opacity: 0.82 }}>Images du canal</div>
                <div style={{ minHeight: 0, display: "grid", alignContent: "start", gap: 8, overflow: "auto", paddingRight: 2 }}>
                  {sidebarItems.map((item) => (
                    <button key={item.key} type="button" onClick={item.onClick} style={{ display: "grid", gridTemplateColumns: "60px minmax(0, 1fr)", gap: 10, alignItems: "center", textAlign: "left", borderRadius: 16, padding: 8, border: item.active ? "1px solid rgba(76,195,255,0.45)" : "1px solid rgba(255,255,255,0.08)", background: item.active ? "rgba(76,195,255,0.08)" : "rgba(255,255,255,0.03)", color: "inherit", cursor: "pointer" }}>
                      <img src={item.previewUrl} alt={item.title} style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 12, display: "block" }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800 }}>{item.title}</div>
                        <div style={{ fontSize: 11, opacity: 0.68, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.subtitle}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
