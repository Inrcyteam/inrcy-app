import React from "react";

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
  const [phase, setPhase] = React.useState<"idle" | "loading" | "ready" | "capturing" | "error">("idle");
  const [error, setError] = React.useState("");
  const [facingMode, setFacingMode] = React.useState<"environment" | "user">("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = React.useState(true);
  const [isLandscapeViewport, setIsLandscapeViewport] = React.useState(false);

  React.useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const updateViewportOrientation = () => {
      setIsLandscapeViewport(window.innerWidth > window.innerHeight);
    };

    updateViewportOrientation();
    window.addEventListener("resize", updateViewportOrientation);
    window.addEventListener("orientationchange", updateViewportOrientation);

    return () => {
      window.removeEventListener("resize", updateViewportOrientation);
      window.removeEventListener("orientationchange", updateViewportOrientation);
    };
  }, [open]);

  React.useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;

    const dispatchCameraState = (active: boolean) => {
      document.documentElement.dataset.inrcyCameraCaptureActive = active ? "true" : "false";
      window.dispatchEvent(
        new CustomEvent("inrcy-camera-capture-active", { detail: { active } })
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

  const stopStream = React.useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // Best effort.
      }
    });
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {
        // Best effort.
      }
    }
  }, []);

  const startCamera = React.useCallback(async () => {
    if (!open) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("error");
      setError("Caméra indisponible sur ce navigateur. Importez une image à la place.");
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
            width: { ideal: 1600 },
            height: { ideal: 1200 },
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }

      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((device) => device.kind === "videoinput");
        setHasMultipleCameras(videoInputs.length !== 1);
      } catch {
        setHasMultipleCameras(true);
      }
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
  }, [facingMode, open, stopStream]);

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
    stopStream();
    onClose();
  }, [onClose, stopStream]);

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

    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!blob) {
      setPhase("error");
      setError("Capture impossible. Importez une image à la place.");
      return;
    }

    const file = new File([blob], buildPhotoFileName(), { type: "image/jpeg" });
    await onCapture(file);
    close();
  }, [close, onCapture, phase]);

  const pickFallbackImage = React.useCallback((files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    void Promise.resolve(onCapture(file)).finally(close);
  }, [close, onCapture]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "rgba(5,8,18,0.88)",
        display: "grid",
        placeItems: "center",
        padding: 14,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: isLandscapeViewport ? "min(96vw, 860px)" : "min(100%, 520px)",
          maxHeight: "min(92dvh, 760px)",
          display: "grid",
          gap: 12,
          borderRadius: 24,
          border: "1px solid rgba(255,255,255,0.16)",
          background: "linear-gradient(180deg, rgba(18,24,44,0.98), rgba(8,12,26,0.98))",
          boxShadow: "0 28px 80px rgba(0,0,0,0.55)",
          padding: 14,
          color: "#fff",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 950, lineHeight: 1.15 }}>{title}</div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Fermer la caméra"
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 18,
              fontWeight: 900,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: isLandscapeViewport ? "16 / 9" : "3 / 4",
            maxHeight: isLandscapeViewport ? "58dvh" : "58dvh",
            borderRadius: 20,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.14)",
            background: "#050816",
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
              display: phase === "ready" || phase === "capturing" ? "block" : "none",
              transform: facingMode === "user" ? "scaleX(-1)" : undefined,
            }}
          />
          {phase !== "ready" && phase !== "capturing" ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                padding: 20,
                textAlign: "center",
                color: "rgba(255,255,255,0.78)",
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              <div>
                <div style={{ fontSize: 28, marginBottom: 10 }}>📷</div>
                {phase === "error" ? error : "Ouverture de la caméra…"}
              </div>
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

        {error ? (
          <div style={{ color: "#ffb4b4", fontSize: 12.5, lineHeight: 1.35 }}>{error}</div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: hasMultipleCameras ? "1fr 1fr" : "1fr", gap: 10 }}>
          {hasMultipleCameras ? (
            <button
              type="button"
              onClick={() => setFacingMode((value) => (value === "environment" ? "user" : "environment"))}
              disabled={phase === "capturing" || phase === "loading"}
              style={{
                minHeight: 42,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                fontWeight: 850,
                cursor: phase === "capturing" || phase === "loading" ? "not-allowed" : "pointer",
                opacity: phase === "capturing" || phase === "loading" ? 0.55 : 1,
              }}
            >
              {facingMode === "environment" ? "Caméra avant" : "Caméra arrière"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={phase === "capturing"}
            style={{
              minHeight: 42,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              fontWeight: 850,
              cursor: phase === "capturing" ? "not-allowed" : "pointer",
              opacity: phase === "capturing" ? 0.55 : 1,
            }}
          >
            Importer
          </button>
        </div>

        <button
          type="button"
          onClick={capture}
          disabled={phase !== "ready"}
          style={{
            minHeight: 48,
            borderRadius: 999,
            border: "1px solid rgba(76,195,255,0.45)",
            background: phase === "ready" ? "linear-gradient(135deg, #48c6ef, #7c3aed)" : "rgba(255,255,255,0.10)",
            color: "#fff",
            fontWeight: 950,
            fontSize: 15,
            cursor: phase === "ready" ? "pointer" : "not-allowed",
            opacity: phase === "ready" ? 1 : 0.58,
            boxShadow: phase === "ready" ? "0 14px 35px rgba(76,195,255,0.22)" : undefined,
          }}
        >
          {phase === "capturing" ? "Ajout de la photo…" : "Capturer la photo"}
        </button>
      </div>
    </div>
  );
}
