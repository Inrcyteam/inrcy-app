import React, { useEffect, useState } from "react";
import { renderBoosterSiteInlineHtml, stripSiteTextFormatting } from "@/lib/boosterFormatting";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

type BackgroundMode = "blur" | "transparent" | "color" | "white" | "black" | "gray" | "sand" | "brand";

type ChannelTab = { key: string; label: string; count?: number; tone?: "ready" | "warning" | "blocked" | "empty" };

type RenderTransform = {
  fit?: "contain" | "cover";
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
  blurBackground?: boolean;
  backgroundMode?: BackgroundMode;
  backgroundColor?: string;
};

type RenderPreset = { width: number; height: number };

type ImageMeta = { width: number; height: number };

type PreviewImage = {
  previewUrl: string;
  transform?: RenderTransform;
  preset?: RenderPreset;
  imageMeta?: ImageMeta;
};

type PreviewVideo = {
  previewUrl: string;
  name?: string | null;
  type?: string | null;
  size?: number | null;
  duration?: number | null;
  aspectRatio?: string | null;
  fitMode?: "contain" | "cover" | null;
};

export type PublicationPreview = {
  channelKey: string;
  mediaType?: "images" | "video";
  channelLabel: string;
  title?: string | null;
  content?: string | null;
  cta?: string | null;
  hashtags?: string[];
  image?: PreviewImage | null;
  images?: PreviewImage[];
  imageCount?: number;
  video?: PreviewVideo | null;
  formatLabel?: string;
};

type CardItem = {
  key: string;
  previewUrl: string;
  included: boolean;
  disabled?: boolean;
  title: string;
  subtitle: string;
  fitLabel: string;
  backgroundMode: BackgroundMode;
  backgroundColor?: string;
  transform?: RenderTransform;
  preset?: RenderPreset;
  imageMeta?: ImageMeta;
  onToggle: () => void;
  onAdapt: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  onRemoveEverywhere?: () => void;
  onReset?: () => void;
  onMovePrevious?: () => void;
  onMoveNext?: () => void;
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
  publicationPreview?: PublicationPreview | null;
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
  onApplyToChannelImages?: () => void;
  onResetChannel?: () => void;
  isolationNote?: string;
  onBackgroundModeChange: (mode: BackgroundMode) => void;
  onBackgroundColorChange?: (color: string) => void;
  pillButtonStyle: React.CSSProperties;
  pillButtonActiveStyle: React.CSSProperties;
  sidebarItems?: SidebarItem[];
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
  if (mode === "transparent") return "transparent";
  if (mode === "blur") return "blur";
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
  if (normalized === "blur") return { background: "#101827" };
  return { background: legacyColorFromMode(mode, backgroundColor) };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function safePreviewZoom(fit: "contain" | "cover", zoom?: number) {
  return clampNumber(zoom || 1, 0.4, fit === "cover" ? 3 : 1);
}

function useViewportWidth(defaultWidth = 1440) {
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window === "undefined" ? defaultWidth : window.innerWidth);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return viewportWidth;
}

function cleanText(value?: string | null) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanNetworkText(value?: string | null) {
  return stripSiteTextFormatting(cleanText(value));
}

function renderSafeSiteInlineHtml(value: string) {
  return sanitizeHtml(renderBoosterSiteInlineHtml(value));
}

function getTransformBackgroundMode(transform?: RenderTransform, fallbackMode?: BackgroundMode): BackgroundMode {
  if (transform?.backgroundMode) return transform.backgroundMode;
  if (transform?.blurBackground) return "blur";
  return fallbackMode || "black";
}

function useNaturalImageMeta(src: string, provided?: ImageMeta) {
  const [meta, setMeta] = useState<ImageMeta | null>(provided && provided.width && provided.height ? provided : null);

  useEffect(() => {
    if (provided?.width && provided?.height) {
      setMeta(provided);
      return;
    }
    if (!src) {
      setMeta(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setMeta({ width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0 });
    };
    img.onerror = () => {
      if (!cancelled) setMeta(null);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, provided?.width, provided?.height]);

  return meta;
}

function FinalImageFrame({
  image,
  aspectRatio,
  fallbackMode = "black",
  fitLabel,
  badge,
}: {
  image?: PreviewImage | null;
  aspectRatio: string;
  fallbackMode?: BackgroundMode;
  fitLabel?: string;
  badge?: string;
}) {
  const src = image?.previewUrl || "";
  const transform = image?.transform || {};
  const preset = image?.preset || { width: 1000, height: 1000 };
  const meta = useNaturalImageMeta(src, image?.imageMeta);
  const mode = getTransformBackgroundMode(transform, fallbackMode);
  const backgroundColor = transform.backgroundColor;
  const fit = transform.fit || "cover";
  const zoom = safePreviewZoom(fit, transform.zoom);

  const imageWidth = meta?.width || 0;
  const imageHeight = meta?.height || 0;
  const canvasWidth = preset.width || 1;
  const canvasHeight = preset.height || 1;

  const layout = (() => {
    if (!imageWidth || !imageHeight) return null;
    const baseScale = fit === "cover" ? Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight) : Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);
    const scale = baseScale * zoom;
    const drawW = imageWidth * scale;
    const drawH = imageHeight * scale;
    const maxX = Math.abs(drawW - canvasWidth) / 2;
    const maxY = Math.abs(drawH - canvasHeight) / 2;
    const dx = (canvasWidth - drawW) / 2 - maxX * clampNumber(transform.offsetX || 0, -100, 100) / 100;
    const dy = (canvasHeight - drawH) / 2 - maxY * clampNumber(transform.offsetY || 0, -100, 100) / 100;
    return {
      left: `${(dx / canvasWidth) * 100}%`,
      top: `${(dy / canvasHeight) * 100}%`,
      width: `${(drawW / canvasWidth) * 100}%`,
      height: `${(drawH / canvasHeight) * 100}%`,
    };
  })();

  const coverLayout = (() => {
    if (!imageWidth || !imageHeight) return null;
    const scale = Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight);
    const drawW = imageWidth * scale;
    const drawH = imageHeight * scale;
    return {
      left: `${(((canvasWidth - drawW) / 2) / canvasWidth) * 100}%`,
      top: `${(((canvasHeight - drawH) / 2) / canvasHeight) * 100}%`,
      width: `${(drawW / canvasWidth) * 100}%`,
      height: `${(drawH / canvasHeight) * 100}%`,
    };
  })();

  return (
    <div style={{ position: "relative", borderRadius: "inherit", overflow: "hidden", aspectRatio, ...previewBackgroundStyle(mode, backgroundColor), border: "1px solid rgba(255,255,255,0.08)" }}>
      {src && mode === "blur" && coverLayout ? (
        <img src={src} alt="" aria-hidden="true" draggable={false} style={{ position: "absolute", ...coverLayout, objectFit: "fill", filter: "blur(18px) saturate(1.05)", transform: "scale(1.06)", opacity: 0.9 }} />
      ) : null}
      {src && mode === "blur" ? <div style={{ position: "absolute", inset: 0, background: "rgba(8,12,24,0.24)" }} /> : null}
      {src && layout ? (
        <img src={src} alt="preview" draggable={false} style={{ position: "absolute", ...layout, objectFit: "fill", display: "block", maxWidth: "none", userSelect: "none", pointerEvents: "none" }} />
      ) : src ? (
        <img src={src} alt="preview" style={{ width: "100%", height: "100%", objectFit: fit, display: "block" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "rgba(255,255,255,0.55)", fontSize: 12 }}>Aucune image</div>
      )}
      {fitLabel ? (
        <div style={{ position: "absolute", left: 8, bottom: 8, fontSize: 11, padding: "5px 8px", borderRadius: 999, background: "rgba(6,10,20,0.72)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}>
          {fitLabel}
        </div>
      ) : null}
      {badge ? (
        <div style={{ position: "absolute", right: 8, bottom: 8, fontSize: 11, padding: "5px 8px", borderRadius: 999, background: "rgba(6,10,20,0.72)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}>
          {badge}
        </div>
      ) : null}
    </div>
  );
}


function formatPreviewVideoSeconds(seconds?: number | null) {
  const numeric = Number(seconds);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  const total = Math.max(0, Math.round(numeric));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatPreviewVideoBytes(bytes?: number | null) {
  const numeric = Number(bytes);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return `${(numeric / (1024 * 1024)).toFixed(numeric >= 10 * 1024 * 1024 ? 0 : 1)} Mo`;
}

function VideoPreviewFrame({
  video,
  aspectRatio,
  badge = "Vidéo",
  dark = false,
}: {
  video?: PreviewVideo | null;
  aspectRatio: string;
  badge?: string;
  dark?: boolean;
}) {
  const src = String(video?.previewUrl || "").trim();
  const duration = formatPreviewVideoSeconds(video?.duration);
  const size = formatPreviewVideoBytes(video?.size);
  const meta = [duration, size].filter(Boolean).join(" · ");

  return (
    <div
      style={{
        position: "relative",
        borderRadius: "inherit",
        overflow: "hidden",
        aspectRatio,
        background: dark ? "#020617" : "#0f172a",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "grid",
        placeItems: "center",
      }}
    >
      {src ? (
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          style={{
            width: "100%",
            height: "100%",
            objectFit: video?.fitMode === "cover" ? "cover" : "contain",
            display: "block",
            background: "#020617",
          }}
        />
      ) : (
        <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 12 }}>Aucune vidéo</div>
      )}
      {badge ? (
        <div style={{ position: "absolute", left: 8, bottom: 8, fontSize: 11, padding: "5px 8px", borderRadius: 999, background: "rgba(6,10,20,0.72)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", pointerEvents: "none" }}>
          {badge}
        </div>
      ) : null}
      {meta ? (
        <div style={{ position: "absolute", right: 8, bottom: 8, fontSize: 11, padding: "5px 8px", borderRadius: 999, background: "rgba(6,10,20,0.72)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", pointerEvents: "none" }}>
          {meta}
        </div>
      ) : null}
    </div>
  );
}

function PublicationPreviewLightbox({
  open,
  images,
  initialIndex,
  aspectRatio,
  fallbackMode,
  onClose,
}: {
  open: boolean;
  images: PreviewImage[];
  initialIndex: number;
  aspectRatio: string;
  fallbackMode: BackgroundMode;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (!open) return;
    setIndex(clampNumber(initialIndex, 0, Math.max(0, images.length - 1)));
  }, [initialIndex, images.length, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (!images.length) return;
      if (event.key === "ArrowLeft") setIndex((prev) => (prev - 1 + images.length) % images.length);
      if (event.key === "ArrowRight") setIndex((prev) => (prev + 1) % images.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [images.length, onClose, open]);

  if (!open || !images.length) return null;
  const safeIndex = clampNumber(index, 0, images.length - 1);
  const current = images[safeIndex] || images[0];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 20000, background: "rgba(2,6,23,0.86)", overflowY: "auto", overflowX: "hidden", padding: "18px 14px", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
      <div style={{ minHeight: "100%", display: "grid", alignItems: "center", justifyItems: "center", gap: 12 }}>
        <div style={{ width: "min(980px, 100%)", display: "grid", gap: 12 }}>
          <div style={{ position: "sticky", top: 8, zIndex: 3, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, color: "#fff", flexWrap: "wrap", padding: "8px 0" }}>
            <div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>Carousel — image {safeIndex + 1} / {images.length}</div>
              <div style={{ fontSize: 11, opacity: 0.65 }}>Flèches clavier, boutons ou miniatures.</div>
            </div>
            <button type="button" onClick={onClose} style={{ border: "1px solid rgba(255,255,255,0.18)", background: "rgba(15,23,42,0.86)", color: "#fff", borderRadius: 999, padding: "9px 14px", cursor: "pointer" }}>Fermer</button>
          </div>

          <div style={{ display: "grid", justifyItems: "center" }}>
            <div style={{ position: "relative", width: "100%", maxWidth: aspectRatio === "4 / 5" ? 620 : aspectRatio === "4 / 3" ? 860 : 760, borderRadius: 22, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 22px 60px rgba(0,0,0,0.36)", background: "#020617" }}>
              <FinalImageFrame image={current} aspectRatio={aspectRatio} fallbackMode={fallbackMode} />
              {images.length > 1 ? (
                <>
                  <button type="button" onClick={() => setIndex((prev) => (prev - 1 + images.length) % images.length)} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 42, height: 42, borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(2,6,23,0.62)", color: "#fff", cursor: "pointer" }}>‹</button>
                  <button type="button" onClick={() => setIndex((prev) => (prev + 1) % images.length)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 42, height: 42, borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(2,6,23,0.62)", color: "#fff", cursor: "pointer" }}>›</button>
                </>
              ) : null}
            </div>
          </div>

          {images.length > 1 ? (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 0 8px", justifyContent: "center" }}>
              {images.map((img, thumbIndex) => (
                <button key={thumbIndex} type="button" onClick={() => setIndex(thumbIndex)} style={{ flex: "0 0 auto", width: 58, height: 58, borderRadius: 12, overflow: "hidden", border: thumbIndex === safeIndex ? "2px solid #ffffff" : "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)", padding: 0, cursor: "pointer" }} aria-label={`Voir l'image ${thumbIndex + 1}`}>
                  <img src={img.previewUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PreviewBlockShell({
  eyebrow,
  title,
  formatLabel,
  children,
  note,
}: {
  eyebrow: string;
  title: string;
  formatLabel?: string;
  children: React.ReactNode;
  note?: string;
}) {
  const viewportWidth = useViewportWidth();
  const isMobile = viewportWidth <= 640;
  const technicalInfo = [eyebrow, formatLabel].filter(Boolean).join(" · ");

  return (
    <section
      style={{
        display: "grid",
        gap: isMobile ? 10 : 12,
        padding: isMobile ? 12 : 16,
        borderRadius: isMobile ? 18 : 22,
        border: "1px solid rgba(76,195,255,0.18)",
        background: "linear-gradient(180deg, rgba(76,195,255,0.090), rgba(255,255,255,0.030))",
        boxShadow: "0 18px 55px rgba(2,6,23,0.18)",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "baseline",
          flexWrap: "wrap",
          minWidth: 0,
        }}
      >
        <div
          style={{
            color: "#ffffff",
            fontWeight: 950,
            fontSize: isMobile ? 15 : 16,
            lineHeight: 1.2,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        {technicalInfo ? (
          <div
            style={{
              color: "rgba(226,232,240,0.76)",
              fontSize: isMobile ? 11 : 12,
              lineHeight: 1.25,
            }}
          >
            — {technicalInfo}
          </div>
        ) : null}
      </div>
      {children}
      {note && !isMobile ? <div style={{ fontSize: 11, opacity: 0.62 }}>{note}</div> : null}
    </section>
  );
}

function DeviceGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14, alignItems: "start", minWidth: 0 }}>
      {children}
    </div>
  );
}

function DeviceCard({ label, children, compact = false }: { label: "Desktop" | "Mobile"; children: React.ReactNode; compact?: boolean }) {
  return (
    <div style={{ display: "grid", gap: compact ? 7 : 8, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.68 }}>{label}</div>
      {children}
    </div>
  );
}

function DevicePreviewSwitcher({ desktop, mobile }: { desktop: React.ReactNode; mobile: React.ReactNode }) {
  const viewportWidth = useViewportWidth();
  const isMobileViewport = viewportWidth <= 640;
  const [active, setActive] = useState<"mobile" | "desktop">("mobile");
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  if (!isMobileViewport) {
    return (
      <DeviceGrid>
        <DeviceCard label="Desktop">{desktop}</DeviceCard>
        <DeviceCard label="Mobile">{mobile}</DeviceCard>
      </DeviceGrid>
    );
  }

  const showDesktop = active === "desktop";
  const activeLabel = showDesktop ? "Desktop" : "Mobile";
  const goPrevious = () => setActive((value) => (value === "mobile" ? "desktop" : "mobile"));
  const goNext = goPrevious;

  return (
    <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 4, borderRadius: 999, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {(["mobile", "desktop"] as const).map((mode) => {
          const selected = active === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setActive(mode)}
              style={{
                minHeight: 34,
                border: selected ? "1px solid rgba(76,195,255,0.42)" : "1px solid transparent",
                borderRadius: 999,
                background: selected ? "rgba(76,195,255,0.18)" : "transparent",
                color: "#fff",
                fontWeight: 900,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {mode === "mobile" ? "Mobile" : "Desktop"}
            </button>
          );
        })}
      </div>

      <div
        onTouchStart={(event) => setTouchStartX(event.touches[0]?.clientX ?? null)}
        onTouchEnd={(event) => {
          if (touchStartX === null) return;
          const endX = event.changedTouches[0]?.clientX ?? touchStartX;
          const delta = endX - touchStartX;
          if (Math.abs(delta) > 42) setActive(delta < 0 ? "desktop" : "mobile");
          setTouchStartX(null);
        }}
        style={{
          position: "relative",
          minWidth: 0,
          borderRadius: 18,
          padding: 10,
          background: "rgba(2,6,23,0.24)",
          border: "1px solid rgba(255,255,255,0.08)",
          overflow: "hidden",
          touchAction: "pan-y",
        }}
      >
        <DeviceCard label={activeLabel} compact>{showDesktop ? desktop : mobile}</DeviceCard>

        <button type="button" onClick={goPrevious} aria-label="Aperçu précédent" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 32, height: 32, borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(2,6,23,0.54)", color: "#fff", cursor: "pointer" }}>‹</button>
        <button type="button" onClick={goNext} aria-label="Aperçu suivant" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 32, height: 32, borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(2,6,23,0.54)", color: "#fff", cursor: "pointer" }}>›</button>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 7 }}>
        <button type="button" onClick={() => setActive("mobile")} aria-label="Voir l'aperçu mobile" style={{ width: active === "mobile" ? 18 : 7, height: 7, borderRadius: 999, border: 0, padding: 0, background: active === "mobile" ? "#ffffff" : "rgba(255,255,255,0.42)", cursor: "pointer", transition: "width 160ms ease" }} />
        <button type="button" onClick={() => setActive("desktop")} aria-label="Voir l'aperçu desktop" style={{ width: active === "desktop" ? 18 : 7, height: 7, borderRadius: 999, border: 0, padding: 0, background: active === "desktop" ? "#ffffff" : "rgba(255,255,255,0.42)", cursor: "pointer", transition: "width 160ms ease" }} />
      </div>
    </div>
  );
}

function SocialCarouselPreview({
  images,
  aspectRatio,
  fallbackMode,
  dark = false,
  onOpen,
}: {
  images: PreviewImage[];
  aspectRatio: string;
  fallbackMode: BackgroundMode;
  dark?: boolean;
  onOpen: (index: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const safeImages = images.length ? images : [];

  useEffect(() => {
    if (!safeImages.length) return;
    setIndex((prev) => clampNumber(prev, 0, safeImages.length - 1));
  }, [safeImages.length]);

  if (!safeImages.length) {
    return <div style={{ borderRadius: 18, overflow: "hidden" }}><FinalImageFrame image={null} aspectRatio={aspectRatio} fallbackMode={fallbackMode} /></div>;
  }

  const current = safeImages[clampNumber(index, 0, safeImages.length - 1)] || safeImages[0];

  return (
    <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", minWidth: 0 }}>
      <button type="button" onClick={() => onOpen(index)} style={{ display: "block", width: "100%", border: 0, padding: 0, background: "transparent", cursor: "pointer" }}>
        <FinalImageFrame image={current} aspectRatio={aspectRatio} fallbackMode={fallbackMode} badge={safeImages.length > 1 ? `Carousel ${index + 1} / ${safeImages.length}` : "Cliquez"} />
      </button>
      {safeImages.length > 1 ? (
        <>
          <button type="button" onClick={() => setIndex((prev) => (prev - 1 + safeImages.length) % safeImages.length)} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 34, height: 34, borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: dark ? "rgba(2,6,23,0.68)" : "rgba(255,255,255,0.92)", color: dark ? "#fff" : "#111827", cursor: "pointer" }}>‹</button>
          <button type="button" onClick={() => setIndex((prev) => (prev + 1) % safeImages.length)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 34, height: 34, borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: dark ? "rgba(2,6,23,0.68)" : "rgba(255,255,255,0.92)", color: dark ? "#fff" : "#111827", cursor: "pointer" }}>›</button>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 10, display: "flex", justifyContent: "center", gap: 6 }}>
            {safeImages.map((_, dotIndex) => (
              <button key={dotIndex} type="button" onClick={() => setIndex(dotIndex)} style={{ width: 7, height: 7, borderRadius: 999, border: 0, padding: 0, background: dotIndex === index ? "#ffffff" : "rgba(255,255,255,0.45)", cursor: "pointer" }} aria-label={`Aller à l'image ${dotIndex + 1}`} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function StackedImageGridPreview({
  images,
  aspectRatio,
  fallbackMode,
  onOpen,
}: {
  images: PreviewImage[];
  aspectRatio: string;
  fallbackMode: BackgroundMode;
  onOpen: (index: number) => void;
}) {
  const safeImages = images.length ? images : [];
  if (!safeImages.length) {
    return <div style={{ borderRadius: 18, overflow: "hidden" }}><FinalImageFrame image={null} aspectRatio={aspectRatio} fallbackMode={fallbackMode} /></div>;
  }
  if (safeImages.length === 1) {
    return (
      <div style={{ borderRadius: 18, overflow: "hidden" }}>
        <button type="button" onClick={() => onOpen(0)} style={{ display: "block", width: "100%", border: 0, padding: 0, background: "transparent", cursor: "pointer" }}>
          <FinalImageFrame image={safeImages[0]} aspectRatio={aspectRatio} fallbackMode={fallbackMode} badge="Cliquez" />
        </button>
      </div>
    );
  }
  const visible = safeImages.slice(0, 4);
  const extraCount = safeImages.length - visible.length;
  const largeFirst = visible.length === 3;
  return (
    <div style={{ display: "grid", gap: 4, gridTemplateColumns: largeFirst ? "1.15fr 1fr" : "repeat(2, minmax(0, 1fr))", minWidth: 0 }}>
      {visible.map((img, index) => {
        const cell = (
          <button type="button" onClick={() => onOpen(index)} style={{ position: "relative", display: "block", width: "100%", border: 0, padding: 0, background: "transparent", cursor: "pointer" }}>
            <div style={{ borderRadius: index === 0 ? 18 : 14, overflow: "hidden" }}>
              <FinalImageFrame image={img} aspectRatio={largeFirst ? "1 / 1" : aspectRatio} fallbackMode={fallbackMode} />
            </div>
            {extraCount > 0 && index === visible.length - 1 ? <div style={{ position: "absolute", inset: 0, borderRadius: 14, background: "rgba(2,6,23,0.45)", display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, fontSize: 28 }}>+{extraCount}</div> : null}
          </button>
        );
        if (!largeFirst) return <div key={index}>{cell}</div>;
        if (index === 0) return <div key={index} style={{ gridRow: "1 / span 2" }}>{cell}</div>;
        return <div key={index}>{cell}</div>;
      })}
    </div>
  );
}

function SitePreviewCard({
  mode,
  title,
  content,
  cta,
  images,
  video,
  isInrcySite,
  onOpen,
}: {
  mode: "desktop" | "mobile";
  title: string;
  content: string;
  cta: string;
  images: PreviewImage[];
  video?: PreviewVideo | null;
  isInrcySite: boolean;
  onOpen: (index: number) => void;
}) {
  const accent = isInrcySite ? "#4cc3ff" : "#111827";
  const isMobile = mode === "mobile";
  const safeImages = images.length ? images : [];
  const mediaAspectRatio = isMobile ? "4 / 3" : "16 / 10";
  return (
    <div style={{ width: "100%", maxWidth: isMobile ? 360 : 680, margin: "0 auto", borderRadius: isMobile ? 24 : 18, background: "#ffffff", color: "#111827", padding: isMobile ? 12 : 14, boxShadow: "0 16px 45px rgba(0,0,0,0.22)", minWidth: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 900 }}>Actualités</div>
        <div style={{ fontSize: 10, fontWeight: 900, color: accent, textTransform: "uppercase", letterSpacing: 0.4 }}>{isMobile ? "Mobile" : "Desktop"}</div>
      </div>
      <article style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 0.95fr) minmax(0, 1fr)", gap: isMobile ? 10 : 14, alignItems: "start", minWidth: 0 }}>
        <div style={{ borderRadius: isInrcySite ? 16 : 10, overflow: "hidden", background: "#eef2f7", minWidth: 0 }}>
          {video?.previewUrl ? (
            <VideoPreviewFrame video={video} aspectRatio={mediaAspectRatio} badge="Vidéo site" />
          ) : safeImages.length > 1 ? (
            <SocialCarouselPreview images={safeImages} aspectRatio={mediaAspectRatio} fallbackMode="color" onOpen={onOpen} />
          ) : (
            <button type="button" onClick={() => onOpen(0)} style={{ display: "block", width: "100%", border: 0, padding: 0, background: "transparent", cursor: safeImages[0] ? "pointer" : "default" }}>
              <FinalImageFrame image={safeImages[0] || null} aspectRatio={mediaAspectRatio} fallbackMode="color" badge={safeImages[0] ? "Cliquez" : undefined} />
            </button>
          )}
        </div>
        <div style={{ minWidth: 0, display: "grid", gap: isMobile ? 7 : 8 }}>
          <h3
            style={{ fontSize: isMobile ? 15 : 18, lineHeight: 1.15, margin: 0, color: "#0f172a", display: "-webkit-box", WebkitLineClamp: isMobile ? 2 : 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            dangerouslySetInnerHTML={{ __html: renderSafeSiteInlineHtml(title) }}
          />
          <p
            style={{ fontSize: isMobile ? 12 : 13, lineHeight: isMobile ? 1.42 : 1.45, margin: 0, color: "#475569", display: "-webkit-box", WebkitLineClamp: isMobile ? 4 : 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            dangerouslySetInnerHTML={{ __html: renderSafeSiteInlineHtml(content) }}
          />
          {cta ? <span style={{ justifySelf: "start", marginTop: 1, padding: isMobile ? "7px 10px" : "8px 12px", borderRadius: isInrcySite ? 999 : 8, background: accent, color: "#fff", fontSize: isMobile ? 11 : 12, fontWeight: 800 }}>{cta}</span> : null}
        </div>
      </article>
    </div>
  );
}

function GoogleBusinessPreviewCard({ mode, title, content, cta, image, video, onOpen }: { mode: "desktop" | "mobile"; title: string; content: string; cta: string; image: PreviewImage | null; video?: PreviewVideo | null; onOpen: () => void }) {
  const isMobile = mode === "mobile";
  return (
    <article style={{ width: "100%", maxWidth: isMobile ? 360 : 620, margin: "0 auto", borderRadius: isMobile ? 24 : 22, background: "#ffffff", color: "#111827", overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 16px 45px rgba(0,0,0,0.22)", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "12px" : "12px 14px" }}>
        <div style={{ width: isMobile ? 26 : 28, height: isMobile ? 26 : 28, borderRadius: 999, background: "#e5e7eb" }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 900 }}>Votre entreprise</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Google Business Profile</div>
        </div>
      </div>
      <div style={{ padding: isMobile ? "0 12px" : "0 14px" }}>
        <div style={{ borderRadius: 16, overflow: "hidden", background: "#eef2f7" }}>
          {video?.previewUrl ? (
            <VideoPreviewFrame video={video} aspectRatio="4 / 3" badge="Vidéo" />
          ) : (
            <button type="button" onClick={onOpen} style={{ display: "block", width: "100%", border: 0, padding: 0, background: "transparent", cursor: image ? "pointer" : "default" }}>
              <FinalImageFrame image={image} aspectRatio="4 / 3" fallbackMode="color" />
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gap: 9, padding: isMobile ? 12 : 16 }}>
        <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 900, lineHeight: 1.25 }}>{title}</div>
        <div style={{ fontSize: isMobile ? 13 : 14, lineHeight: 1.55, whiteSpace: "pre-wrap", color: "#374151", display: "-webkit-box", WebkitLineClamp: isMobile ? 5 : 7, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{content}</div>
        {cta ? <div style={{ justifySelf: "start", padding: "8px 12px", borderRadius: 999, background: "#2563eb", color: "#fff", fontSize: 12, fontWeight: 800 }}>{cta}</div> : null}
      </div>
    </article>
  );
}

function InstagramPreviewCard({
  mode,
  titleValue,
  title,
  content,
  cta,
  hashtags,
  images,
  video,
  onOpen,
}: {
  mode: "desktop" | "mobile";
  titleValue: string;
  title: string;
  content: string;
  cta: string;
  hashtags: string[];
  images: PreviewImage[];
  video?: PreviewVideo | null;
  onOpen: (index: number) => void;
}) {
  const isMobile = mode === "mobile";
  const caption = titleValue ? `${title}\n\n${content}` : content;
  const hasVideo = !!video?.previewUrl;

  if (isMobile) {
    return (
      <article style={{ width: "100%", maxWidth: 360, margin: "0 auto", borderRadius: 24, background: "#ffffff", color: "#111827", overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 16px 45px rgba(0,0,0,0.22)", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px 10px" }}>
          <div style={{ width: 32, height: 32, borderRadius: 999, background: "#f3f4f6" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 13 }}>Votre entreprise</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Instagram</div>
          </div>
        </div>
        {hasVideo ? (
          <VideoPreviewFrame video={video} aspectRatio="4 / 5" badge="Vidéo Instagram" dark />
        ) : (
          <SocialCarouselPreview images={images} aspectRatio="4 / 5" fallbackMode="black" dark onOpen={onOpen} />
        )}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 12px 0", fontSize: 18 }}>
          <div style={{ display: "flex", gap: 12 }}><span>♡</span><span>💬</span><span>➤</span></div><span>⌑</span>
        </div>
        <div style={{ display: "grid", gap: 8, padding: "8px 12px 14px" }}>
          <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 8, WebkitBoxOrient: "vertical", overflow: "hidden" }}><span style={{ fontWeight: 900 }}>Votre entreprise</span> {caption}</div>
          {cta ? <div style={{ fontSize: 12, fontWeight: 800, color: "#2563eb" }}>{cta}</div> : null}
          {hashtags.length ? <div style={{ fontSize: 12, lineHeight: 1.5, color: "#2563eb" }}>{hashtags.map((tag) => `#${tag}`).join(" ")}</div> : null}
        </div>
      </article>
    );
  }

  return (
    <article style={{ width: "100%", maxWidth: 880, margin: "0 auto", borderRadius: 22, background: "#ffffff", color: "#111827", overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 16px 45px rgba(0,0,0,0.22)", display: "grid", gridTemplateColumns: "minmax(0, 1.08fr) minmax(0, 0.92fr)", minWidth: 0 }}>
      <div style={{ minWidth: 0, background: "#000" }}>
        {hasVideo ? (
          <VideoPreviewFrame video={video} aspectRatio="4 / 5" badge="Vidéo Instagram" dark />
        ) : (
          <SocialCarouselPreview images={images} aspectRatio="4 / 5" fallbackMode="black" dark onOpen={onOpen} />
        )}
      </div>
      <div style={{ minWidth: 0, display: "grid", gridTemplateRows: "auto 1fr auto", maxHeight: 560 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ width: 36, height: 36, borderRadius: 999, background: "#f3f4f6" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 14 }}>Votre entreprise</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Instagram</div>
          </div>
        </div>
        <div style={{ padding: 16, overflow: "hidden", display: "grid", gap: 10, alignContent: "start" }}>
          <div style={{ fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 12, WebkitBoxOrient: "vertical", overflow: "hidden" }}><span style={{ fontWeight: 900 }}>Votre entreprise</span> {caption}</div>
          {cta ? <div style={{ fontSize: 13, fontWeight: 800, color: "#2563eb" }}>{cta}</div> : null}
          {hashtags.length ? <div style={{ fontSize: 13, lineHeight: 1.5, color: "#2563eb" }}>{hashtags.map((tag) => `#${tag}`).join(" ")}</div> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 16px", borderTop: "1px solid #e5e7eb", color: "#6b7280", fontSize: 12 }}>
          <div style={{ display: "flex", gap: 12 }}><span>♡</span><span>💬</span><span>➤</span></div>
          <div>{hasVideo ? "1 vidéo" : images.length > 1 ? `${images.length} photos` : "1 photo"}</div>
        </div>
      </div>
    </article>
  );
}

function FeedPreviewCard({ mode, channel, title, content, cta, hashtags = [], images, video, onOpen }: { mode: "desktop" | "mobile"; channel: "facebook" | "linkedin" | "tiktok"; title: string; content: string; cta: string; hashtags?: string[]; images: PreviewImage[]; video?: PreviewVideo | null; onOpen: (index: number) => void }) {
  const isMobile = mode === "mobile";
  const isLinkedin = channel === "linkedin";
  const isTiktok = channel === "tiktok";
  const normalizedVideoAspect = String(video?.aspectRatio || "").replace(/\s+/g, "");
  const isVerticalVideo = normalizedVideoAspect === "9/16";
  const isSquareVideo = normalizedVideoAspect === "1/1";
  const label = isTiktok ? "TikTok" : isLinkedin ? "LinkedIn" : "Facebook";
  const maxWidth = isTiktok
    ? (isMobile ? 230 : 260)
    : isVerticalVideo
      ? (isMobile ? 292 : 340)
      : isSquareVideo
        ? (isMobile ? 330 : 500)
        : (isMobile ? 350 : 620);
  const avatarSize = isTiktok ? (isMobile ? 28 : 34) : (isMobile ? 34 : 40);
  return (
    <article style={{ width: "100%", maxWidth, margin: "0 auto", borderRadius: isMobile ? 24 : 22, background: "#ffffff", color: "#111827", overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 16px 45px rgba(0,0,0,0.22)", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: isTiktok ? 8 : 10, padding: isTiktok ? (isMobile ? "9px 10px 6px" : "10px 12px 7px") : (isMobile ? "12px 12px 8px" : "14px 16px 10px") }}>
        <div style={{ width: avatarSize, height: avatarSize, borderRadius: 999, background: "#e5e7eb", flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: isTiktok ? (isMobile ? 11.5 : 12.5) : (isMobile ? 13 : 14), fontWeight: 900 }}>{isLinkedin ? "Votre entreprise · 1er" : isTiktok ? "@votreentreprise" : "Votre entreprise"}</div>
          <div style={{ fontSize: isTiktok ? 10.5 : 12, color: "#6b7280" }}>{label}</div>
        </div>
      </div>
      <div style={{ display: "grid", gap: isTiktok ? 8 : 12, padding: isTiktok ? (isMobile ? "0 10px 10px" : "0 12px 12px") : (isMobile ? "0 12px 12px" : "0 16px 14px") }}>
        <div style={{ fontSize: isTiktok ? (isMobile ? 11.5 : 12.5) : (isMobile ? 13 : 14), lineHeight: isTiktok ? 1.45 : 1.55, whiteSpace: "pre-wrap", color: "#111827" }}>
          <div style={{ fontWeight: 900, marginBottom: isTiktok ? 5 : 8 }}>{title}</div>
          <div style={{ display: "-webkit-box", WebkitLineClamp: isTiktok ? (isMobile ? 3 : 4) : (isMobile ? 5 : 7), WebkitBoxOrient: "vertical", overflow: "hidden" }}>{content}</div>
          {cta ? <div style={{ marginTop: isTiktok ? 6 : 10, fontWeight: 800, color: isTiktok ? "#111827" : isLinkedin ? "#0a66c2" : "#1877f2" }}>{cta}</div> : null}
          {hashtags.length ? <div style={{ marginTop: isTiktok ? 5 : 8, fontWeight: 800, color: isTiktok ? "#111827" : isLinkedin ? "#0a66c2" : "#1877f2" }}>{hashtags.map((tag) => `#${tag}`).join(" ")}</div> : null}
        </div>
        {video?.previewUrl ? <div style={{ borderRadius: isTiktok ? 14 : 18, overflow: "hidden", background: isTiktok ? "#000" : undefined }}><VideoPreviewFrame video={video} aspectRatio={isTiktok ? (video.aspectRatio || "9 / 16") : (video.aspectRatio || "1 / 1")} badge={`Vidéo ${label}`} /></div> : <StackedImageGridPreview images={images} aspectRatio={isTiktok ? "9 / 16" : "1 / 1"} fallbackMode={isTiktok ? "black" : "color"} onOpen={onOpen} />}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: isTiktok ? 7 : 10, paddingTop: 4, borderTop: "1px solid #e5e7eb", color: "#6b7280", fontSize: isTiktok ? 10.5 : 12, flexWrap: "wrap" }}>
          <div>{video?.previewUrl ? "1 vidéo" : images.length > 1 ? `${images.length} photos • cliquez pour ouvrir` : "1 photo • cliquez pour ouvrir"}</div>
          <div style={{ display: "flex", gap: 12 }}>
            <span>J’aime</span>
            <span>Commenter</span>
            <span>{isTiktok ? "Partager" : isLinkedin ? "Republier" : "Partager"}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ChannelPublicationPreview({ preview }: { preview: PublicationPreview }) {
  const key = String(preview.channelKey || "");
  const isSite = key === "inrcy_site" || key === "site_web" || key === "site";
  const isInstagram = key === "instagram";
  const isLinkedin = key === "linkedin";
  const isTiktok = key === "tiktok";
  const isGmb = key === "gmb" || key === "google_business" || key === "google_business_profile";
  const rawTitleValue = isSite ? String(preview.title || "").trim() : cleanText(preview.title);
  const rawContentValue = isSite ? String(preview.content || "").trim() : cleanText(preview.content);
  const titleValue = isSite ? rawTitleValue : cleanNetworkText(rawTitleValue);
  const contentValue = isSite ? rawContentValue : cleanNetworkText(rawContentValue);
  const title = titleValue || "Titre de la publication";
  const content = contentValue || "Le contenu apparaîtra ici.";
  const cta = isSite ? cleanText(preview.cta) : cleanNetworkText(preview.cta);
  const hashtags = (preview.hashtags || []).map((tag) => String(tag || "").replace(/^#+/, "").trim()).filter(Boolean).slice(0, 8);
  const fallbackPreset = isSite ? { width: 1440, height: 900 } : isTiktok ? { width: 1080, height: 1920 } : isInstagram ? { width: 1080, height: 1350 } : isGmb ? { width: 1200, height: 900 } : { width: 1200, height: 1200 };
  const rawImages = (preview.images || []).filter((item) => item?.previewUrl);
  const image = preview.image ? { ...preview.image, preset: preview.image.preset || fallbackPreset } : null;
  const images = (rawImages.length ? rawImages : image ? [image] : []).map((item) => ({ ...item, preset: item.preset || fallbackPreset }));
  const firstImage = images[0] || image || null;
  const video = preview.mediaType === "video" && preview.video?.previewUrl ? preview.video : null;
  const hasVideo = !!video;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);

  if (isSite) {
    const isInrcySite = key === "inrcy_site";
    return (
      <>
        <PreviewBlockShell eyebrow="rendu iframe intégré" title={preview.channelLabel} note={hasVideo ? "Aperçu séparé desktop/mobile avec lecteur vidéo intégré." : "Aperçu séparé desktop/mobile. Dès qu’il y a 2 images ou plus, le site passe en carousel. Cliquez sur une image pour l’ouvrir en grand."}>
          <DevicePreviewSwitcher
            desktop={<SitePreviewCard mode="desktop" title={title} content={content} cta={cta} images={images} video={video} isInrcySite={isInrcySite} onOpen={openLightbox} />}
            mobile={<SitePreviewCard mode="mobile" title={title} content={content} cta={cta} images={images} video={video} isInrcySite={isInrcySite} onOpen={openLightbox} />}
          />
        </PreviewBlockShell>
        {!hasVideo ? <PublicationPreviewLightbox open={lightboxIndex !== null} images={images} initialIndex={lightboxIndex || 0} aspectRatio="16 / 10" fallbackMode="color" onClose={closeLightbox} /> : null}
      </>
    );
  }

  if (isInstagram) {
    return (
      <>
        <PreviewBlockShell eyebrow={preview.formatLabel || "image finale"} title={preview.channelLabel} note={hasVideo ? "Instagram : lecteur vidéo à gauche en desktop, vidéo puis légende en mobile." : "Instagram : desktop avec média à gauche et légende à droite. Mobile : image puis contenu en dessous. Carousel simulé si plusieurs photos."}>
          <DevicePreviewSwitcher
            desktop={<InstagramPreviewCard mode="desktop" titleValue={titleValue} title={title} content={content} cta={cta} hashtags={hashtags} images={images} video={video} onOpen={openLightbox} />}
            mobile={<InstagramPreviewCard mode="mobile" titleValue={titleValue} title={title} content={content} cta={cta} hashtags={hashtags} images={images} video={video} onOpen={openLightbox} />}
          />
        </PreviewBlockShell>
        {!hasVideo ? <PublicationPreviewLightbox open={lightboxIndex !== null} images={images} initialIndex={lightboxIndex || 0} aspectRatio="4 / 5" fallbackMode="black" onClose={closeLightbox} /> : null}
      </>
    );
  }

  if (isGmb) {
    return (
      <>
        <PreviewBlockShell eyebrow={preview.formatLabel || "image finale"} title={preview.channelLabel} note={hasVideo ? "Google Business : aperçu vidéo en haut, contenu en dessous. Compatibilité publication API à valider à l’étape canaux." : "Google Business : photo en haut, contenu en dessous, en desktop comme en mobile."}>
          <DevicePreviewSwitcher
            desktop={<GoogleBusinessPreviewCard mode="desktop" title={title} content={content} cta={cta} image={firstImage} video={video} onOpen={() => openLightbox(0)} />}
            mobile={<GoogleBusinessPreviewCard mode="mobile" title={title} content={content} cta={cta} image={firstImage} video={video} onOpen={() => openLightbox(0)} />}
          />
        </PreviewBlockShell>
        {!hasVideo ? <PublicationPreviewLightbox open={lightboxIndex !== null} images={images} initialIndex={lightboxIndex || 0} aspectRatio="4 / 3" fallbackMode="color" onClose={closeLightbox} /> : null}
      </>
    );
  }

  if (isTiktok) {
    return (
      <>
        <PreviewBlockShell eyebrow={preview.formatLabel || "format TikTok"} title={preview.channelLabel} note={hasVideo ? "TikTok : aperçu desktop + mobile en version compacte, format vertical recommandé." : "TikTok : aperçu desktop + mobile compact. Clic sur les photos = carousel."}>
          <DevicePreviewSwitcher
            desktop={<FeedPreviewCard mode="desktop" channel="tiktok" title={title} content={content} cta={cta} hashtags={hashtags} images={images} video={video} onOpen={openLightbox} />}
            mobile={<FeedPreviewCard mode="mobile" channel="tiktok" title={title} content={content} cta={cta} hashtags={hashtags} images={images} video={video} onOpen={openLightbox} />}
          />
        </PreviewBlockShell>
        {!hasVideo ? <PublicationPreviewLightbox open={lightboxIndex !== null} images={images} initialIndex={lightboxIndex || 0} aspectRatio="9 / 16" fallbackMode="black" onClose={closeLightbox} /> : null}
      </>
    );
  }

  const networkLabel = isLinkedin ? "LinkedIn" : "Facebook";
  const feedChannel = isLinkedin ? "linkedin" : "facebook";
  return (
    <>
      <PreviewBlockShell eyebrow={preview.formatLabel || "image finale"} title={preview.channelLabel} note={hasVideo ? `${networkLabel} : aperçu vertical avec texte et lecteur vidéo.` : `${networkLabel} : aperçu vertical photos/vidéo. Clic sur les photos = carousel.`}>
        <DevicePreviewSwitcher
          desktop={<FeedPreviewCard mode="desktop" channel={feedChannel} title={title} content={content} cta={cta} hashtags={hashtags} images={images} video={video} onOpen={openLightbox} />}
          mobile={<FeedPreviewCard mode="mobile" channel={feedChannel} title={title} content={content} cta={cta} hashtags={hashtags} images={images} video={video} onOpen={openLightbox} />}
        />
      </PreviewBlockShell>
      {!hasVideo ? <PublicationPreviewLightbox open={lightboxIndex !== null} images={images} initialIndex={lightboxIndex || 0} aspectRatio={isTiktok ? "9 / 16" : "1 / 1"} fallbackMode={isTiktok ? "black" : "color"} onClose={closeLightbox} /> : null}
    </>
  );
}

export function ChannelImageAdapterCardsPanel({
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
  publicationPreview,
}: CardsPanelProps) {
  const viewportWidth = useViewportWidth();

  const isNarrow = viewportWidth <= 560;
  const cardColumnCount = isNarrow
    ? 1
    : viewportWidth <= 920
      ? 2
      : viewportWidth <= 1180
        ? 3
        : viewportWidth <= 1420
          ? 4
          : 5;
  const cardGridTemplate = `repeat(${cardColumnCount}, minmax(0, 1fr))`;
  const statusStyles: Record<NonNullable<ChannelTab["tone"]>, React.CSSProperties> = {
    ready: { border: "1px solid rgba(34,197,94,0.34)", color: "#bbf7d0", background: "rgba(34,197,94,0.10)" },
    warning: { border: "1px solid rgba(251,191,36,0.36)", color: "#fde68a", background: "rgba(251,191,36,0.10)" },
    blocked: { border: "1px solid rgba(248,113,113,0.38)", color: "#fecaca", background: "rgba(248,113,113,0.10)" },
    empty: { border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.72)", background: "rgba(255,255,255,0.045)" },
  };

  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
      {showTabs ? (
        <div
          style={{
            display: isNarrow ? "grid" : "flex",
            gridTemplateColumns: isNarrow
              ? "repeat(2, minmax(0, 1fr))"
              : undefined,
            gap: 8,
            flexWrap: isNarrow ? undefined : "wrap",
            overflowX: "hidden",
          }}
        >
          {tabs.map((tab) => {
            const statusStyle = tab.tone ? statusStyles[tab.tone] : undefined;
            const isActive = activeChannel === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onActiveChannelChange(tab.key)}
                title={tab.tone === "blocked" ? "Correction requise" : tab.tone === "warning" ? "À vérifier" : tab.tone === "ready" ? "Prêt" : undefined}
                style={{
                  ...pillButtonStyle,
                  ...(statusStyle || {}),
                  ...(isActive
                    ? statusStyle
                      ? {
                          boxShadow:
                            "0 0 0 1px rgba(76,195,255,0.25) inset, 0 0 14px rgba(76,195,255,0.16)",
                        }
                      : pillButtonActiveStyle
                    : {}),
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: isNarrow ? 4 : 7,
                  whiteSpace: "nowrap",
                  width: isNarrow ? "100%" : undefined,
                  minWidth: 0,
                  maxWidth: "100%",
                  minHeight: isNarrow ? 34 : undefined,
                  padding: isNarrow ? "0 6px" : pillButtonStyle?.padding,
                  fontSize: isNarrow ? 12 : pillButtonStyle?.fontSize,
                  lineHeight: isNarrow ? 1 : pillButtonStyle?.lineHeight,
                  boxSizing: "border-box",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "clip",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab.label}
                </span>
                {typeof tab.count === "number" ? (
                  <span
                    style={{
                      flex: "0 0 auto",
                      minWidth: isNarrow ? 18 : 20,
                      height: isNarrow ? 18 : 20,
                      padding: isNarrow ? "0 4px" : "0 6px",
                      borderRadius: 999,
                      display: "inline-grid",
                      placeItems: "center",
                      fontSize: isNarrow ? 10 : 11,
                      fontWeight: 900,
                      background: "rgba(255,255,255,0.12)",
                      color: "inherit",
                    }}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 18, padding: isNarrow ? 10 : 14, background: "rgba(255,255,255,0.03)", display: "grid", gap: 12, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ fontWeight: 900 }}>Images de la publication</div>
            <div style={{ fontSize: 12, opacity: 0.66 }}>Canal : {channelTitle} · sélectionnez les images, changez l’ordre, puis adaptez seulement si le cadrage n’est pas bon.</div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.78 }}>{formatLabel}</div>
        </div>

        {items.length ? (
          <div style={{ display: "grid", gridTemplateColumns: cardGridTemplate, gap: 12, alignItems: "stretch", justifyContent: "start", minWidth: 0 }}>
            {items.map((item) => {
              const isDisabled = !!item.disabled && !item.included;
              return (
              <div
                key={item.key}
                style={{
                  width: "100%",
                  maxWidth: "none",
                  minWidth: 0,
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 18,
                  padding: 10,
                  background: item.included ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.025)",
                  display: "grid",
                  gridTemplateRows: "auto auto auto 1fr",
                  gap: 8,
                  opacity: isDisabled ? 0.48 : 1,
                }}
              >
                <div style={{ position: "relative", borderRadius: 14, overflow: "hidden" }}>
                  <FinalImageFrame
                    image={{ previewUrl: item.previewUrl, transform: item.transform, preset: item.preset, imageMeta: item.imageMeta }}
                    aspectRatio={aspectRatio}
                    fallbackMode={item.backgroundMode}
                    fitLabel={item.fitLabel}
                  />
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800, cursor: isDisabled ? "not-allowed" : "pointer", minWidth: 0 }}>
                  <input type="checkbox" checked={item.included} disabled={isDisabled} onChange={isDisabled ? undefined : item.onToggle} style={{ width: 16, height: 16, accentColor: "#4cc3ff", flex: "0 0 auto" }} />
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 900, padding: "4px 7px", borderRadius: 999, background: item.included ? "rgba(34,197,94,0.13)" : "rgba(255,255,255,0.06)", color: item.included ? "#bbf7d0" : "rgba(255,255,255,0.62)", border: item.included ? "1px solid rgba(34,197,94,0.22)" : "1px solid rgba(255,255,255,0.08)" }}>
                    {item.included ? "Incluse" : "Ignorée"}
                  </span>
                </label>

                <div style={{ fontSize: 11, opacity: 0.68, minHeight: 28, lineHeight: 1.35 }}>{item.subtitle}</div>

                <div style={{ display: "grid", gap: 7, alignSelf: "end" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "34px 1fr 34px 34px", gap: 6 }}>
                    <button type="button" className={buttonClassName} onClick={item.onMovePrevious} disabled={!item.onMovePrevious} title="Image précédente" style={{ justifyContent: "center", opacity: item.onMovePrevious ? 1 : 0.45, padding: "0 8px" }}>←</button>
                    <button type="button" className={buttonClassName} onClick={item.onAdapt} style={{ justifyContent: "center", padding: "0 10px" }}>Adapter</button>
                    {item.onReset ? <button type="button" className={buttonClassName} onClick={item.onReset} aria-label={`Réinitialiser ${item.title}`} style={{ justifyContent: "center", padding: "0 8px" }}>↺</button> : <span />}
                    <button type="button" className={buttonClassName} onClick={item.onMoveNext} disabled={!item.onMoveNext} title="Image suivante" style={{ justifyContent: "center", opacity: item.onMoveNext ? 1 : 0.45, padding: "0 8px" }}>→</button>
                  </div>
                  {(item.onRemove || item.onRemoveEverywhere) ? (
                    <div style={{ display: "grid", gridTemplateColumns: item.onRemove && item.onRemoveEverywhere ? "1fr 1fr" : "1fr", gap: 6 }}>
                      {item.onRemove ? (
                        <button type="button" className={buttonClassName} onClick={item.onRemove} style={{ justifyContent: "center", fontSize: 12, padding: "0 8px" }}>{item.removeLabel || "Retirer"}</button>
                      ) : null}
                      {item.onRemoveEverywhere ? (
                        <button type="button" className={buttonClassName} onClick={item.onRemoveEverywhere} style={{ justifyContent: "center", fontSize: 12, padding: "0 8px", background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.24)", color: "#fecaca" }}>Suppr. partout</button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 13, opacity: 0.75 }}>{emptyMessage || "Aucune image"}</div>
        )}
      </div>

      {publicationPreview ? (
        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <ChannelPublicationPreview preview={publicationPreview} />
        </div>
      ) : null}
    </div>
  );
}

export function ChannelImageAdapterModal({
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
  onApplyToChannelImages,
  onResetChannel,
  isolationNote,
  onBackgroundModeChange,
  onBackgroundColorChange,
  pillButtonStyle,
  pillButtonActiveStyle,
  sidebarItems,
}: ModalProps) {
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window === "undefined" ? 1440 : window.innerWidth);
  const [showBefore, setShowBefore] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShowBefore(false);
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  if (!open) return null;

  const hasLayout = !!previewLayout;
  const normalizedBgMode = normalizedMode(backgroundMode);
  const bgMode = normalizedBgMode === "blur" ? "color" : normalizedBgMode;
  const bgFill = legacyColorFromMode(backgroundMode, backgroundColor);
  const previewBg = previewBackgroundStyle(backgroundMode, backgroundColor);

  const isMobile = viewportWidth <= 768;
  const isTinyMobile = viewportWidth <= 390;
  const isCompact = viewportWidth <= 1180;
  const mobileOuterPadding = isTinyMobile ? 8 : 10;
  const mobileViewportWidth = `calc(100dvw - ${mobileOuterPadding * 2}px)`;
  const mobileViewportHeight = `calc(100dvh - ${mobileOuterPadding * 2}px)`;
  const modalWidth = isMobile ? mobileViewportWidth : "min(1580px, calc(100vw - 28px))";
  const modalHeight = isMobile ? mobileViewportHeight : "min(940px, calc(100dvh - 28px))";
  const modalPadding = isTinyMobile ? 10 : isMobile ? 12 : 18;
  const previewMinHeight = isMobile ? (isTinyMobile ? 150 : 180) : isCompact ? 320 : 0;
  const previewHeight = isMobile ? "clamp(150px, 42dvh, 260px)" : undefined;
  const controlsGridColumns = isMobile ? "repeat(2, minmax(0, 1fr))" : "48px 48px 1fr 1fr";
  const contentGridTemplateColumns = isMobile ? undefined : isCompact ? "minmax(0, 1fr)" : "minmax(0, 1fr) 300px 320px";
  const contentGridTemplateRows = isMobile ? undefined : isCompact ? "auto auto auto" : undefined;
  return (
    <div role="dialog" aria-modal="true" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10020, background: "rgba(4, 8, 18, 0.78)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", display: "grid", placeItems: isMobile ? "stretch" : "center", padding: isMobile ? mobileOuterPadding : 16, overflow: "hidden", boxSizing: "border-box" }}>
      <div onClick={(event) => event.stopPropagation()} style={{ width: modalWidth, maxWidth: isMobile ? mobileViewportWidth : "100%", height: modalHeight, maxHeight: isMobile ? mobileViewportHeight : "100%", minWidth: 0, minHeight: 0, alignSelf: isMobile ? "stretch" : undefined, justifySelf: isMobile ? "stretch" : undefined, borderRadius: isMobile ? 20 : 28, border: "1px solid rgba(255,255,255,0.12)", background: "linear-gradient(180deg, rgba(24,28,42,0.985), rgba(14,17,28,0.985))", boxShadow: "0 28px 100px rgba(0,0,0,0.5)", padding: modalPadding, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: isMobile ? 10 : 16, overflow: "hidden", boxSizing: "border-box" }}>
        <div style={{ display: isMobile ? "grid" : "flex", alignItems: isMobile ? "start" : "center", justifyContent: "space-between", gap: isMobile ? 8 : 12, minHeight: isMobile ? "auto" : 52, flexWrap: "wrap", minWidth: 0 }}>
          <div style={{ minWidth: 0, flex: "1 1 280px", paddingLeft: isMobile ? "max(6px, env(safe-area-inset-left))" : 0, paddingRight: isMobile ? 4 : 0, boxSizing: "border-box" }}>
            <div style={{ fontWeight: 900, fontSize: isMobile ? 16 : 18, whiteSpace: isMobile ? "normal" : "nowrap", overflow: "visible", textOverflow: "ellipsis", lineHeight: 1.2, overflowWrap: "anywhere", wordBreak: "break-word", paddingLeft: isMobile ? 2 : 0 }}>
              {title}
            </div>
            <div style={{ fontSize: 12, opacity: 0.74, marginTop: 4, overflowWrap: "anywhere", paddingLeft: isMobile ? 2 : 0 }}>{subtitle}</div>
          </div>
          <div style={{ display: "flex", alignItems: "stretch", gap: isMobile ? 6 : 8, flexShrink: 1, flexWrap: "wrap", justifyContent: isMobile ? "stretch" : "flex-end", width: isMobile ? "100%" : undefined, minWidth: 0, overflow: "visible", boxSizing: "border-box" }}>
            <button type="button" className={buttonClassName} onClick={onApplyToChannelImages} disabled={!onApplyToChannelImages} title={onApplyToChannelImages ? "Appliquer ce cadrage à toutes les images de ce canal" : "Disponible avec au moins 2 images sur ce canal"} style={{ minWidth: 0, minHeight: isMobile ? 42 : 44, height: isMobile ? 42 : 44, flex: isMobile ? "1 1 0" : undefined, maxWidth: isMobile ? "none" : undefined, justifyContent: "center", alignItems: "center", fontSize: isMobile ? 11 : undefined, lineHeight: 1.1, padding: isMobile ? "0 6px" : "0 16px", whiteSpace: "normal", textAlign: "center", boxSizing: "border-box", opacity: onApplyToChannelImages ? 1 : 0.48, cursor: onApplyToChannelImages ? "pointer" : "not-allowed" }}>Appliquer partout</button>
            {onApplyToSelectedChannels ? <button type="button" className={buttonClassName} onClick={onApplyToSelectedChannels} style={{ minWidth: 0, minHeight: isMobile ? 42 : 44, height: isMobile ? 42 : 44, flex: isMobile ? "1 1 0" : undefined, justifyContent: "center", alignItems: "center", fontSize: isMobile ? 11 : undefined, lineHeight: 1.1, padding: isMobile ? "0 6px" : "0 16px", whiteSpace: "normal", textAlign: "center", boxSizing: "border-box" }}>Appliquer aux canaux</button> : null}
            {onResetChannel ? <button type="button" className={buttonClassName} onClick={onResetChannel} style={{ minWidth: 0, minHeight: isMobile ? 42 : 44, height: isMobile ? 42 : 44, flex: isMobile ? "1 1 0" : undefined, justifyContent: "center", alignItems: "center", fontSize: isMobile ? 11 : undefined, lineHeight: 1.1, padding: isMobile ? "0 6px" : "0 16px", whiteSpace: "nowrap", textAlign: "center", boxSizing: "border-box" }}>Réinit. canal</button> : null}
            <button type="button" className={primaryButtonClassName || buttonClassName} onClick={onSave} aria-label="Enregistrer" title="Enregistrer" style={{ minWidth: 0, minHeight: isMobile ? 42 : 44, height: isMobile ? 42 : 44, flex: isMobile ? "0 0 42px" : undefined, width: isMobile ? 42 : undefined, padding: isMobile ? 0 : "0 16px", justifyContent: "center", alignItems: "center", fontSize: isMobile ? 18 : undefined, boxSizing: "border-box" }}>{isMobile ? "💾" : "Enregistrer"}</button>
            <button type="button" className={buttonClassName} onClick={onClose} aria-label="Fermer" title="Fermer" style={{ minWidth: 0, minHeight: isMobile ? 42 : 44, height: isMobile ? 42 : 44, flex: isMobile ? "0 0 42px" : undefined, width: isMobile ? 42 : undefined, padding: isMobile ? 0 : "0 16px", justifyContent: "center", alignItems: "center", fontSize: isMobile ? 20 : undefined, boxSizing: "border-box" }}>{isMobile ? "×" : "Fermer"}</button>
          </div>
        </div>

        <div style={{ minHeight: 0, minWidth: 0, width: "100%", maxWidth: "100%", display: isMobile ? "flex" : "grid",
    flexDirection: isMobile ? "column" : undefined, gridTemplateColumns: contentGridTemplateColumns, gridTemplateRows: contentGridTemplateRows, gap: isMobile ? 18 : 18, alignItems: "stretch", overflowY: "auto", overflowX: "hidden", paddingRight: isMobile ? 0 : 0, paddingBottom: isMobile ? "max(72px, env(safe-area-inset-bottom))" : 0, WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", boxSizing: "border-box" }}>
          <div style={{ minWidth: 0, minHeight: 0, display: isMobile ? "flex" : "grid", flexDirection: isMobile ? "column" : undefined, gridTemplateRows: isMobile ? undefined : "minmax(0, 1fr) auto", gap: isMobile ? 10 : undefined, order: isMobile ? 2 : 1, flex: isMobile ? "0 0 auto" : undefined }}>
            <div style={{ minWidth: 0, width: "100%", minHeight: previewMinHeight, height: previewHeight, maxHeight: isMobile ? "42dvh" : undefined, display: "grid", placeItems: "center", borderRadius: isMobile ? 18 : 24, border: "1px solid rgba(255,255,255,0.10)", background: "linear-gradient(180deg, rgba(255,255,255,0.015), rgba(255,255,255,0.02))", padding: isMobile ? 6 : 14, overflow: "hidden", flex: isMobile ? "0 0 auto" : undefined, boxSizing: "border-box" }}>
              <div
                ref={previewRef}
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                onDoubleClick={onDoubleClick}
                style={{ position: "relative", width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%", aspectRatio, borderRadius: isMobile ? 16 : 22, overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)", ...previewBg, cursor: isDragging ? "grabbing" : "grab", touchAction: "none", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.03)" }}
              >
                {showBefore ? (
                  <img src={previewSrc} alt="aperçu avant" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", userSelect: "none", pointerEvents: "none", background: "rgba(255,255,255,0.04)" }} />
                ) : hasLayout && previewLayout ? (
                  <img src={previewSrc} alt="preview" draggable={false} style={{ position: "absolute", left: previewLayout.dx, top: previewLayout.dy, width: previewLayout.drawW, height: previewLayout.drawH, maxWidth: "none", pointerEvents: "none", userSelect: "none" }} />
                ) : (
                  <img src={previewSrc} alt="preview" draggable={false} style={previewImageStyle} onMouseDown={onImageMouseDown} />
                )}
                <div style={{ position: "absolute", inset: 12, borderRadius: 16, border: "1px solid rgba(255,255,255,0.14)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.14)", pointerEvents: "none" }} />
                <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", pointerEvents: "none", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, padding: "6px 10px", borderRadius: 999, background: "rgba(6,10,20,0.72)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}>{showBefore ? "Avant auto" : `${fitLabel} • ${zoomLabel}`}</div>
                  {!isMobile ? <div style={{ fontSize: 11, padding: "6px 10px", borderRadius: 999, background: "rgba(6,10,20,0.72)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}>Glisser • Molette • Double-clic</div> : null}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.72, padding: isMobile ? "12px 10px 0" : "10px 2px 0", lineHeight: 1.55, width: "100%", maxWidth: "100%", boxSizing: "border-box", overflowWrap: "break-word", wordBreak: "normal" }}>Déplacez l’image, ajustez le zoom, choisissez Remplir ou Adapter, puis enregistrez. {isolationNote || "Ces réglages concernent uniquement ce canal."}</div>
          </div>

          <div style={{ minWidth: 0, minHeight: 0, display: isMobile ? "flex" : "grid", flexDirection: isMobile ? "column" : undefined, alignContent: "start", gap: 12, order: isMobile ? 2 : 1, flex: isMobile ? "0 0 auto" : undefined }}>
            <div style={{ display: "grid", gap: 8, padding: isMobile ? 12 : 14, borderRadius: 20, minWidth: 0, width: "100%", boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><div style={{ fontSize: 12, opacity: 0.82 }}>Cadrage</div><div style={{ fontSize: 11, opacity: 0.55 }}>{fitLabel} • {zoomLabel}</div></div>
              <div style={{ display: "grid", gridTemplateColumns: controlsGridColumns, gap: 8 }}>
                <button type="button" className={buttonClassName} onClick={onZoomOut} style={{ justifyContent: "center" }}>−</button>
                <button type="button" className={buttonClassName} onClick={onZoomIn} style={{ justifyContent: "center" }}>+</button>
                <button type="button" className={buttonClassName} onClick={onContain} style={{ justifyContent: "center" }}>Adapter</button>
                <button type="button" className={buttonClassName} onClick={onCover} style={{ justifyContent: "center" }}>Remplir</button>
              </div>
              <button type="button" className={buttonClassName} onClick={() => setShowBefore((value) => !value)} style={{ width: "100%", justifyContent: "center" }}>{showBefore ? "Voir le rendu final" : "Comparer avant / rendu"}</button>
              <button type="button" className={buttonClassName} onClick={onReset} style={{ width: "100%", justifyContent: "center" }}>Réinitialiser cette image</button>
            </div>

            <div style={{ display: "grid", gap: 6, padding: 12, borderRadius: 18, minWidth: 0, width: "100%", boxSizing: "border-box", border: "1px solid rgba(76,195,255,0.18)", background: "rgba(76,195,255,0.06)", fontSize: 12, lineHeight: 1.35 }}>
              <b>Réglage isolé</b>
              <span style={{ opacity: 0.78 }}>{isolationNote || "Ce cadrage ne modifie pas les autres canaux ni les autres sites."}</span>
            </div>

            <div style={{ display: "grid", gap: 10, padding: isMobile ? 12 : 14, borderRadius: 20, minWidth: 0, width: "100%", boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
              <div style={{ fontSize: 12, opacity: 0.82 }}>Arrière-plan</div>
              <select value={bgMode} onChange={(e) => onBackgroundModeChange(e.target.value as BackgroundMode)} style={{ width: "100%", minHeight: 42, borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "#ffffff", color: "#111827", padding: "0 12px" }}>
                <option value="transparent" style={{ background: "#ffffff", color: "#111827" }}>Transparent</option>
                <option value="color" style={{ background: "#ffffff", color: "#111827" }}>Fond uni</option>
              </select>
              {bgMode === "color" ? (
                <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.82 }}>
                  <span>Couleur de fond</span>
                  <input type="color" value={bgFill} onChange={(e) => onBackgroundColorChange?.(e.target.value)} style={{ width: "100%", height: 48, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "transparent" }} />
                </label>
              ) : null}
            </div>
          </div>

          <div style={{ minWidth: 0, minHeight: 0, display: isMobile ? "flex" : "grid", flexDirection: isMobile ? "column" : undefined, gridTemplateRows: isMobile ? undefined : "minmax(0, 1fr)", gap: 12, order: isMobile ? 3 : 2, flex: isMobile ? "0 0 auto" : undefined }}>
            {sidebarItems?.length ? (
              <div style={{ minHeight: 0, height: isMobile ? "auto" : "100%",
                marginTop: isMobile ? 8 : 0, display: "grid", gridTemplateRows: isMobile ? undefined : isCompact ? "auto auto" : "auto minmax(0, 1fr)", gap: 8, padding: 14, borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                <div style={{ fontSize: 12, opacity: 0.82 }}>Images du canal</div>
                <div
                  style={{
                    minHeight: 0,
                    display: "grid",
                    gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : isCompact ? "repeat(auto-fit, minmax(min(180px, 100%), 1fr))" : undefined,
                    alignContent: "start",
                    gap: 8,
                    overflowX: "hidden",
                    overflowY: isMobile ? "visible" : "auto",
                    paddingRight: 2,
                    paddingBottom: isMobile ? 2 : 0,
                  }}
                >
                  {sidebarItems.map((item) => (
                    <button key={item.key} type="button" onClick={item.onClick} style={{ width: "100%", display: "grid", gridTemplateColumns: "60px minmax(0, 1fr)", gap: 10, alignItems: "center", textAlign: "left", borderRadius: 16, padding: 8, border: item.active ? "1px solid rgba(76,195,255,0.45)" : "1px solid rgba(255,255,255,0.08)", background: item.active ? "rgba(76,195,255,0.08)" : "rgba(255,255,255,0.03)", color: "inherit", cursor: "pointer", minWidth: 0, flex: undefined }}>
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
