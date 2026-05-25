import React from "react";
import { createPortal } from "react-dom";

function buildPhotoFileName() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "-");
  return `photo-inrcy-${stamp}.jpg`;
}

type InrcyCameraCaptureModalProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  onCapture: (file: File) => void | Promise<void>;
};

type ZoomCapability = {
  min?: number;
  max?: number;
  step?: number;
};

type ExtendedCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: ZoomCapability | number;
};

type PointerPoint = {
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getPointerDistance(points: PointerPoint[]) {
  if (points.length < 2) return 0;
  const dx = points[0].x - points[1].x;
  const dy = points[0].y - points[1].y;
  return Math.hypot(dx, dy);
}

export default function InrcyCameraCaptureModal({
  open,
  title = "Prendre une photo",
  onClose,
  onCapture,
}: InrcyCameraCaptureModalProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const mountedRef = React.useRef(false);
  const pointersRef = React.useRef<Map<number, PointerPoint>>(new Map());
  const pinchStartRef = React.useRef<{ distance: number; zoom: number } | null>(
    null,
  );

  const [phase, setPhase] = React.useState<
    "idle" | "loading" | "ready" | "capturing" | "error"
  >("idle");
  const [error, setError] = React.useState("");
  const [facingMode, setFacingMode] = React.useState<"environment" | "user">(
    "environment",
  );
  const [hasMultipleCameras, setHasMultipleCameras] = React.useState(true);
  const [isLandscapeViewport, setIsLandscapeViewport] = React.useState(false);
  const [isMobileCameraViewport, setIsMobileCameraViewport] =
    React.useState(false);
  const [torchSupported, setTorchSupported] = React.useState(false);
  const [torchOn, setTorchOn] = React.useState(false);
  const [hardwareZoomSupported, setHardwareZoomSupported] =
    React.useState(false);
  const [zoom, setZoom] = React.useState(1);
  const [zoomLimits, setZoomLimits] = React.useState({
    min: 1,
    max: 4,
    step: 0.05,
  });
  const [flashNotice, setFlashNotice] = React.useState("");

  React.useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const updateViewport = () => {
      const coarsePointer =
        window.matchMedia?.("(pointer: coarse)").matches ?? false;
      setIsLandscapeViewport(window.innerWidth > window.innerHeight);
      setIsMobileCameraViewport(coarsePointer || window.innerWidth <= 820);
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);

    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, [open]);

  React.useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined")
      return;

    const dispatchCameraState = (active: boolean) => {
      document.documentElement.dataset.inrcyCameraCaptureActive = active
        ? "true"
        : "false";
      window.dispatchEvent(
        new CustomEvent("inrcy-camera-capture-active", { detail: { active } }),
      );
    };

    if (open) {
      dispatchCameraState(true);
      return () => {
        dispatchCameraState(false);
      };
    }

    dispatchCameraState(false);
  }, [open]);

  React.useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  }, [open]);

  const applyTorch = React.useCallback(async (enabled: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: enabled }] as unknown as MediaTrackConstraintSet[],
      });
      setTorchOn(enabled);
    } catch (err) {
      console.warn("inrcy_camera_torch_apply_failed", err);
      setTorchOn(false);
      setTorchSupported(false);
      setFlashNotice("Flash indisponible sur cet appareil");
      window.setTimeout(() => setFlashNotice(""), 1800);
    }
  }, []);

  const stopStream = React.useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;

    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Best effort.
        }
      });
    }

    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {
        // Best effort.
      }
    }

    pointersRef.current.clear();
    pinchStartRef.current = null;
    setTorchOn(false);
    setTorchSupported(false);
    setFlashNotice("");
    setHardwareZoomSupported(false);
    setZoom(1);
  }, []);

  const applyZoom = React.useCallback(
    async (nextZoom: number) => {
      const normalizedZoom = clamp(nextZoom, zoomLimits.min, zoomLimits.max);
      setZoom(normalizedZoom);

      if (!hardwareZoomSupported) return;

      const track = streamRef.current?.getVideoTracks()[0];
      if (!track) return;

      try {
        await track.applyConstraints({
          advanced: [
            { zoom: normalizedZoom },
          ] as unknown as MediaTrackConstraintSet[],
        });
      } catch {
        setHardwareZoomSupported(false);
      }
    },
    [hardwareZoomSupported, zoomLimits.max, zoomLimits.min],
  );

  const readCameraCapabilities = React.useCallback(
    (stream: MediaStream) => {
      const track = stream.getVideoTracks()[0];
      if (!track || typeof track.getCapabilities !== "function") {
        setTorchSupported(false);
        setHardwareZoomSupported(false);
        setZoomLimits({ min: 1, max: 4, step: 0.05 });
        setZoom(1);
        return;
      }

      try {
        const capabilities = track.getCapabilities() as ExtendedCapabilities;
        const zoomCapability = capabilities.zoom;
        const nextTorchSupported =
          Boolean(capabilities.torch) && facingMode === "environment";
        let nextZoomLimits = { min: 1, max: 4, step: 0.05 };
        let nextHardwareZoomSupported = false;

        if (typeof zoomCapability === "object" && zoomCapability !== null) {
          const min = Number.isFinite(zoomCapability.min)
            ? Number(zoomCapability.min)
            : 1;
          const max = Number.isFinite(zoomCapability.max)
            ? Number(zoomCapability.max)
            : 4;
          const step = Number.isFinite(zoomCapability.step)
            ? Number(zoomCapability.step)
            : 0.05;
          nextHardwareZoomSupported = max > min;
          nextZoomLimits = {
            min: Math.max(1, min),
            max: Math.max(1, max),
            step: Math.max(0.01, step),
          };
        }

        setTorchSupported(nextTorchSupported);
        setHardwareZoomSupported(nextHardwareZoomSupported);
        setZoomLimits(nextZoomLimits);
        setZoom(nextZoomLimits.min || 1);
      } catch {
        setTorchSupported(false);
        setHardwareZoomSupported(false);
        setZoomLimits({ min: 1, max: 4, step: 0.05 });
        setZoom(1);
      }
    },
    [facingMode],
  );

  const startCamera = React.useCallback(async () => {
    if (!open) return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setPhase("error");
      setError(
        "Caméra indisponible sur ce navigateur. Importez une image à la place.",
      );
      return;
    }

    setPhase("loading");
    setError("");
    stopStream();

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
      }

      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(
          (device) => device.kind === "videoinput",
        );
        setHasMultipleCameras(videoInputs.length !== 1);
      } catch {
        setHasMultipleCameras(true);
      }

      readCameraCapabilities(stream);

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => undefined);
      }
      setPhase("ready");
    } catch (err) {
      console.warn("inrcy_camera_open_failed", err);
      stopStream();
      setPhase("error");
      setError("Autorisez la caméra ou importez une image à la place.");
    }
  }, [facingMode, open, readCameraCapabilities, stopStream]);

  React.useEffect(() => {
    mountedRef.current = true;
    if (open) void startCamera();
    return () => {
      mountedRef.current = false;
      stopStream();
    };
  }, [open, startCamera, stopStream]);

  React.useEffect(() => {
    if (!open) {
      setPhase("idle");
      setError("");
      stopStream();
    }
  }, [open, stopStream]);

  const close = React.useCallback(() => {
    void applyTorch(false).finally(() => {
      stopStream();
      onClose();
    });
  }, [applyTorch, onClose, stopStream]);

  const capture = React.useCallback(async () => {
    if (phase !== "ready") return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    if (!width || !height) {
      setError("Image caméra indisponible. Réessayez ou importez une image.");
      setPhase("error");
      return;
    }

    setPhase("capturing");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setPhase("error");
      setError("Capture impossible sur ce navigateur.");
      return;
    }

    context.save();
    if (facingMode === "user") {
      context.translate(width, 0);
      context.scale(-1, 1);
    }

    if (!hardwareZoomSupported && zoom > 1) {
      const sourceWidth = width / zoom;
      const sourceHeight = height / zoom;
      const sourceX = (width - sourceWidth) / 2;
      const sourceY = (height - sourceHeight) / 2;
      context.drawImage(
        video,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        width,
        height,
      );
    } else {
      context.drawImage(video, 0, 0, width, height);
    }
    context.restore();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!blob) {
      setPhase("error");
      setError("Capture impossible. Importez une image à la place.");
      return;
    }

    const file = new File([blob], buildPhotoFileName(), { type: "image/jpeg" });
    await applyTorch(false);
    await onCapture(file);
    close();
  }, [
    applyTorch,
    close,
    facingMode,
    hardwareZoomSupported,
    onCapture,
    phase,
    zoom,
  ]);

  const pickFallbackImage = React.useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      void Promise.resolve(onCapture(file)).finally(close);
    },
    [close, onCapture],
  );

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      pointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Best effort.
      }

      const points = Array.from(pointersRef.current.values());
      if (points.length === 2) {
        pinchStartRef.current = {
          distance: getPointerDistance(points),
          zoom,
        };
      }
    },
    [zoom],
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      const points = Array.from(pointersRef.current.values());
      const pinchStart = pinchStartRef.current;
      if (points.length !== 2 || !pinchStart || pinchStart.distance <= 0)
        return;

      event.preventDefault();
      const currentDistance = getPointerDistance(points);
      const ratio = currentDistance / pinchStart.distance;
      void applyZoom(pinchStart.zoom * ratio);
    },
    [applyZoom],
  );

  const handlePointerEnd = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size < 2) {
        pinchStartRef.current = null;
      }
    },
    [],
  );

  if (!open) return null;

  const isBusy = phase === "capturing" || phase === "loading";
  const canCapture = phase === "ready";
  const shellIsFullscreen = isMobileCameraViewport;
  const showVisualZoom = !hardwareZoomSupported && zoom > 1;

  const iconButtonBase: React.CSSProperties = {
    width: isLandscapeViewport ? 48 : 54,
    height: isLandscapeViewport ? 48 : 54,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.26)",
    background: "rgba(6,10,24,0.58)",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontSize: isLandscapeViewport ? 20 : 22,
    fontWeight: 950,
    cursor: isBusy ? "not-allowed" : "pointer",
    opacity: isBusy ? 0.55 : 1,
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.28)",
    flex: "0 0 auto",
  };

  const captureButtonStyle: React.CSSProperties = {
    width: isLandscapeViewport ? 64 : 78,
    height: isLandscapeViewport ? 64 : 78,
    borderRadius: 999,
    border: "4px solid rgba(255,255,255,0.92)",
    background: canCapture
      ? "linear-gradient(135deg, #48c6ef, #7c3aed 56%, #ff4fd8)"
      : "rgba(255,255,255,0.14)",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontSize: isLandscapeViewport ? 25 : 30,
    cursor: canCapture ? "pointer" : "not-allowed",
    opacity: canCapture ? 1 : 0.58,
    boxShadow: canCapture ? "0 18px 42px rgba(124,58,237,0.34)" : undefined,
    flex: "0 0 auto",
  };

  const fallbackButtonStyle: React.CSSProperties = {
    minHeight: 44,
    borderRadius: 999,
    border: "1px solid rgba(76,195,255,0.45)",
    background: "linear-gradient(135deg, #48c6ef, #7c3aed)",
    color: "#fff",
    fontWeight: 950,
    padding: "0 18px",
    cursor: "pointer",
  };

  const closeButton = (
    <button
      type="button"
      onClick={close}
      aria-label="Fermer la caméra"
      style={{
        ...iconButtonBase,
        position: "absolute",
        top: "max(12px, env(safe-area-inset-top))",
        right: "max(12px, env(safe-area-inset-right))",
        zIndex: 4,
        width: isLandscapeViewport ? 42 : 46,
        height: isLandscapeViewport ? 42 : 46,
        fontSize: isLandscapeViewport ? 22 : 24,
      }}
    >
      ×
    </button>
  );

  const switchCameraButton = hasMultipleCameras ? (
    <button
      type="button"
      onClick={() => {
        setFacingMode((value) =>
          value === "environment" ? "user" : "environment",
        );
      }}
      disabled={isBusy}
      aria-label={
        facingMode === "environment"
          ? "Passer en caméra avant"
          : "Passer en caméra arrière"
      }
      title={facingMode === "environment" ? "Caméra avant" : "Caméra arrière"}
      style={iconButtonBase}
    >
      ⇄
    </button>
  ) : (
    <span
      style={{
        width: iconButtonBase.width,
        height: iconButtonBase.height,
        flex: "0 0 auto",
      }}
    />
  );

  const flashButton = (
    <button
      type="button"
      onClick={() => {
        if (isBusy) return;
        if (!torchSupported) {
          setFlashNotice("Flash indisponible sur cet appareil");
          window.setTimeout(() => setFlashNotice(""), 1800);
          return;
        }
        void applyTorch(!torchOn);
      }}
      disabled={isBusy}
      aria-disabled={!torchSupported}
      aria-label={
        torchSupported
          ? torchOn
            ? "Désactiver le flash"
            : "Activer le flash"
          : "Flash indisponible sur cet appareil"
      }
      title={
        torchSupported
          ? torchOn
            ? "Flash activé"
            : "Flash"
          : "Flash indisponible sur cet appareil"
      }
      style={{
        ...iconButtonBase,
        background: torchSupported
          ? torchOn
            ? "linear-gradient(135deg, #f59e0b, #ff4fd8)"
            : iconButtonBase.background
          : "rgba(15,23,42,0.72)",
        color: torchSupported ? "#fff" : "rgba(255,255,255,0.78)",
        borderColor: torchSupported
          ? "rgba(255,255,255,0.26)"
          : "rgba(255,255,255,0.34)",
        cursor: torchSupported && !isBusy ? "pointer" : "not-allowed",
        opacity: isBusy ? 0.55 : 1,
        boxShadow: torchSupported
          ? iconButtonBase.boxShadow
          : "0 12px 28px rgba(0,0,0,0.24)",
      }}
    >
      ⚡
    </button>
  );

  const captureButton = (
    <button
      type="button"
      onClick={capture}
      disabled={!canCapture}
      aria-label={
        phase === "capturing" ? "Ajout de la photo" : "Capturer la photo"
      }
      title="Capturer la photo"
      style={captureButtonStyle}
    >
      {phase === "capturing" ? "…" : "📷"}
    </button>
  );

  const dialog = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        width: "100dvw",
        height: "100dvh",
        background: "rgba(5,8,18,0.96)",
        display: "grid",
        placeItems: "center",
        padding: shellIsFullscreen ? 0 : 14,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "relative",
          width: shellIsFullscreen ? "100vw" : "min(100%, 540px)",
          height: shellIsFullscreen ? "100dvh" : "min(92dvh, 760px)",
          display: "flex",
          flexDirection: "column",
          borderRadius: shellIsFullscreen ? 0 : 28,
          border: shellIsFullscreen
            ? "none"
            : "1px solid rgba(255,255,255,0.16)",
          background: "#050816",
          boxShadow: shellIsFullscreen
            ? "none"
            : "0 28px 80px rgba(0,0,0,0.55)",
          color: "#fff",
          overflow: "hidden",
        }}
      >
        {closeButton}

        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onDoubleClick={() => void applyZoom(zoomLimits.min)}
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            minHeight: 0,
            flex: "1 1 auto",
            overflow: "hidden",
            background: "#050816",
            touchAction: "none",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display:
                phase === "ready" || phase === "capturing" ? "block" : "none",
              transform:
                `${facingMode === "user" ? "scaleX(-1) " : ""}${showVisualZoom ? `scale(${zoom})` : ""}`.trim() ||
                undefined,
              transformOrigin: "center center",
            }}
          />

          {phase !== "ready" && phase !== "capturing" ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                padding: 28,
                textAlign: "center",
                color: "rgba(255,255,255,0.84)",
                fontSize: 14,
                lineHeight: 1.45,
                background:
                  "radial-gradient(circle at 50% 35%, rgba(124,58,237,0.22), transparent 38%), #050816",
              }}
            >
              <div style={{ maxWidth: 340 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📷</div>
                <div>
                  {phase === "error" ? error : "Ouverture de la caméra…"}
                </div>
                {phase === "error" ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ ...fallbackButtonStyle, marginTop: 16 }}
                  >
                    Importer une image
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {phase !== "idle" && phase !== "error" ? (
            <div
              style={{
                position: "absolute",
                top: "max(14px, env(safe-area-inset-top))",
                left: "max(14px, env(safe-area-inset-left))",
                zIndex: 3,
                borderRadius: 999,
                padding: "7px 11px",
                minWidth: 42,
                textAlign: "center",
                background: "rgba(6,10,24,0.72)",
                border: "1px solid rgba(255,255,255,0.26)",
                color: "#fff",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                fontSize: 13,
                fontWeight: 950,
                boxShadow: "0 10px 24px rgba(0,0,0,0.3)",
              }}
              title="Pincez avec deux doigts pour zoomer"
            >
              {zoom <= (zoomLimits.min || 1) + 0.02
                ? "1x"
                : `${zoom.toFixed(1)}x`}
            </div>
          ) : null}

          {flashNotice ? (
            <div
              role="status"
              style={{
                position: "absolute",
                left: "50%",
                bottom: isLandscapeViewport ? 86 : 106,
                transform: "translateX(-50%)",
                zIndex: 5,
                maxWidth: "calc(100% - 32px)",
                borderRadius: 999,
                padding: "9px 13px",
                background: "rgba(15,23,42,0.82)",
                border: "1px solid rgba(255,255,255,0.24)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 850,
                textAlign: "center",
                boxShadow: "0 14px 34px rgba(0,0,0,0.32)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
              }}
            >
              {flashNotice}
            </div>
          ) : null}
        </div>

        <canvas ref={canvasRef} style={{ display: "none" }} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(event) => {
            pickFallbackImage(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />

        <div
          style={{
            position: "absolute",
            left: "max(14px, env(safe-area-inset-left))",
            right: "max(14px, env(safe-area-inset-right))",
            bottom: "max(14px, env(safe-area-inset-bottom))",
            zIndex: 4,
            pointerEvents: phase === "error" ? "none" : "auto",
          }}
        >
          {isLandscapeViewport ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                {switchCameraButton}
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                {flashButton}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                {captureButton}
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                {switchCameraButton}
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                {captureButton}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                {flashButton}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}
