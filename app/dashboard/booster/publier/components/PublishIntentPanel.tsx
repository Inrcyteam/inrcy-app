import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  BOOSTER_MAX_IMAGE_COUNT,
  BOOSTER_RECOMMENDED_VIDEO_DURATION_LABEL,
  BOOSTER_MAX_VIDEO_MB_LABEL,
  THEME_PLACEHOLDERS,
  type ChannelKey,
  type ChannelMediaMode,
  type PublicationMediaType,
  type ThemeKey,
} from "../publishModal.shared";
import { textAreaStyle } from "../publishModal.styles";

type PublishModalStyles = Readonly<Record<string, string>>;

function formatVideoSeconds(seconds: number | null) {
  if (!Number.isFinite(Number(seconds))) return "";
  const safeSeconds = Math.max(0, Math.round(Number(seconds)));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

type VoiceState = "idle" | "recording" | "transcribing";
type VoiceRecordingMode = "media" | "liveOnly";

type VoiceSpeechRecognitionAlternative = {
  transcript?: string;
};

type VoiceSpeechRecognitionResult = {
  readonly isFinal?: boolean;
  readonly length: number;
  readonly [index: number]: VoiceSpeechRecognitionAlternative | undefined;
};

type VoiceSpeechRecognitionResultList = {
  readonly length: number;
  readonly [index: number]: VoiceSpeechRecognitionResult | undefined;
};

type VoiceSpeechRecognitionEvent = Event & {
  readonly results?: VoiceSpeechRecognitionResultList;
};

type VoiceSpeechRecognitionErrorEvent = Event & {
  readonly error?: string;
};

type VoiceSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: VoiceSpeechRecognitionEvent) => void) | null;
  onerror: ((event: VoiceSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type VoiceSpeechRecognitionConstructor = new () => VoiceSpeechRecognition;

const VOICE_MAX_SECONDS = 90;
const VOICE_MIN_BYTES = 900;

const voiceMimeCandidates = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg;codecs=opus",
  "audio/wav",
];

function formatVoiceDuration(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function pickVoiceMimeType() {
  if (
    typeof window === "undefined" ||
    typeof window.MediaRecorder === "undefined"
  )
    return "";
  return (
    voiceMimeCandidates.find((type) =>
      window.MediaRecorder.isTypeSupported(type),
    ) || ""
  );
}

function voiceExtensionFromMime(type: string) {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("mpeg")) return "mp3";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  return "webm";
}

function appendVoiceText(current: string, next: string) {
  const cleanCurrent = current.trim();
  const cleanNext = next.trim();
  if (!cleanCurrent) return cleanNext;
  if (!cleanNext) return cleanCurrent;
  return `${cleanCurrent}\n${cleanNext}`;
}

function normalizeLiveVoiceText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanTranscriptTextForSubmission(value: string) {
  return normalizeLiveVoiceText(value).slice(0, 1400).trim();
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: VoiceSpeechRecognitionConstructor;
    webkitSpeechRecognition?: VoiceSpeechRecognitionConstructor;
  };
  return (
    speechWindow.SpeechRecognition ||
    speechWindow.webkitSpeechRecognition ||
    null
  );
}

function waitForVoiceWarmup(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getVoicePlatformInfo() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      isIOS: false,
      isSafari: false,
      hasSpeechRecognition: false,
      canUseLivePreview: false,
      shouldUseLiveOnly: false,
      shouldWarmupMicrophone: false,
    };
  }

  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const isIOS =
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (platform === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1);
  const isSafari =
    /Safari/i.test(userAgent) &&
    !/Chrome|Chromium|CriOS|FxiOS|Edg|EdgiOS|OPR|Opera/i.test(userAgent);
  const hasSpeechRecognition = Boolean(getSpeechRecognitionConstructor());
  const shouldUseLiveOnly = hasSpeechRecognition && (isIOS || isSafari);

  return {
    isIOS,
    isSafari,
    hasSpeechRecognition,
    canUseLivePreview: hasSpeechRecognition && !isIOS && !isSafari,
    shouldUseLiveOnly,
    shouldWarmupMicrophone: isIOS || isSafari,
  };
}

async function warmupVoiceMicrophoneIfNeeded() {
  const { shouldWarmupMicrophone } = getVoicePlatformInfo();
  if (!shouldWarmupMicrophone) return;

  try {
    if (window.sessionStorage.getItem("inrcy_voice_micro_warmed_v1") === "1")
      return;
  } catch {
    // sessionStorage peut être indisponible en navigation privée stricte.
  }

  const warmupStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
  });
  warmupStream.getTracks().forEach((track) => track.stop());

  try {
    window.sessionStorage.setItem("inrcy_voice_micro_warmed_v1", "1");
  } catch {
    // Best-effort only.
  }

  await waitForVoiceWarmup(450);
}

type PublishIntentPanelProps = {
  styles: PublishModalStyles;
  isMobile: boolean;
  theme: ThemeKey;
  idea: string;
  setIdea: Dispatch<SetStateAction<string>>;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  videoInputRef: MutableRefObject<HTMLInputElement | null>;
  onImagesChange: (files: FileList | null) => void;
  onVideoChange: (files: FileList | null) => void;
  onPickImagesClick: () => void;
  onPickVideoClick: () => void;
  onTakePhotoClick: () => void;
  publicationMediaType: PublicationMediaType;
  channelMediaModes: Partial<Record<ChannelKey, ChannelMediaMode>>;
  setChannelMediaMode: (channel: ChannelKey, mode: ChannelMediaMode) => void;
  images: File[];
  imagePreviews: string[];
  videoFile: File | null;
  videoPreviewUrl: string;
  videoDurationSeconds: number | null;
  removeVideo: () => void;
  removeImage: (index: number) => void;
  useImagesForAI: boolean;
  setUseImagesForAI: Dispatch<SetStateAction<boolean>>;
  imgError: string;
  genError: string;
  generating: boolean;
  generationStage: string;
  generationProgress: number;
  onGenerate: () => void;
  onReset: () => void;
  onOpenAiConfiguration: () => void;
};

export default function PublishIntentPanel({
  styles,
  isMobile,
  theme,
  idea,
  setIdea,
  fileInputRef,
  videoInputRef,
  onImagesChange,
  onVideoChange,
  onPickImagesClick,
  onPickVideoClick,
  onTakePhotoClick,
  publicationMediaType,
  channelMediaModes: _channelMediaModes,
  setChannelMediaMode: _setChannelMediaMode,
  images,
  imagePreviews,
  videoFile,
  videoPreviewUrl,
  videoDurationSeconds,
  removeVideo,
  removeImage,
  useImagesForAI,
  setUseImagesForAI,
  imgError,
  genError,
  generating,
  generationStage,
  generationProgress,
  onGenerate,
  onReset,
  onOpenAiConfiguration,
}: PublishIntentPanelProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceRecordingModeRef = useRef<VoiceRecordingMode | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const maxRecordingTimerRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<VoiceSpeechRecognition | null>(null);
  const liveVoiceBaseTextRef = useRef("");
  const liveVoiceLastTextRef = useRef("");
  const hasLiveVoiceDraftRef = useRef(false);
  const liveOnlyUnavailableRef = useRef(false);
  const [liveVoiceEnabled, setLiveVoiceEnabled] = useState(false);

  const clearVoiceTimers = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (maxRecordingTimerRef.current) {
      window.clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }
  };

  const stopMediaStream = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const stopLiveSpeechRecognition = () => {
    const recognition = speechRecognitionRef.current;
    speechRecognitionRef.current = null;
    setLiveVoiceEnabled(false);
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
        // Best-effort cleanup only.
      }
    }
  };

  const resetLiveVoiceDraft = () => {
    liveVoiceBaseTextRef.current = "";
    liveVoiceLastTextRef.current = "";
    hasLiveVoiceDraftRef.current = false;
  };

  const startLiveSpeechRecognition = (baseText: string) => {
    const SpeechRecognitionConstructor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionConstructor) return false;

    try {
      stopLiveSpeechRecognition();
      resetLiveVoiceDraft();

      const recognition = new SpeechRecognitionConstructor();
      recognition.lang = "fr-FR";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      liveVoiceBaseTextRef.current = baseText;

      recognition.onresult = (event) => {
        const results = event.results;
        if (!results?.length) return;

        let liveText = "";
        for (let index = 0; index < results.length; index += 1) {
          const transcript = results[index]?.[0]?.transcript || "";
          liveText += ` ${transcript}`;
        }

        const normalizedLiveText = normalizeLiveVoiceText(liveText);
        if (!normalizedLiveText) return;

        liveVoiceLastTextRef.current = normalizedLiveText;
        hasLiveVoiceDraftRef.current = true;
        setIdea(() =>
          appendVoiceText(liveVoiceBaseTextRef.current, normalizedLiveText),
        );
      };

      recognition.onerror = () => {
        speechRecognitionRef.current = null;
        setLiveVoiceEnabled(false);
        if (voiceRecordingModeRef.current === "liveOnly") {
          clearVoiceTimers();
          voiceRecordingModeRef.current = null;
          liveOnlyUnavailableRef.current = true;
          setRecordingSeconds(0);
          setVoiceState("idle");
          setVoiceError(
            "Dictée en direct indisponible sur ce navigateur. Réessaie : iNrCy basculera sur le vocal classique.",
          );
        }
      };

      recognition.onend = () => {
        speechRecognitionRef.current = null;
        setLiveVoiceEnabled(false);
        if (voiceRecordingModeRef.current === "liveOnly") {
          clearVoiceTimers();
          voiceRecordingModeRef.current = null;
          void submitLiveVoiceTextForCorrection();
        }
      };

      recognition.start();
      speechRecognitionRef.current = recognition;
      setLiveVoiceEnabled(true);
      return true;
    } catch {
      speechRecognitionRef.current = null;
      setLiveVoiceEnabled(false);
      return false;
    }
  };

  const submitLiveVoiceTextForCorrection = async () => {
    const liveTranscript = cleanTranscriptTextForSubmission(
      liveVoiceLastTextRef.current,
    );
    if (!liveTranscript) {
      setVoiceError(
        "Aucun texte n’a été détecté pendant le vocal. Réessaie en parlant un peu plus longtemps.",
      );
      resetLiveVoiceDraft();
      setVoiceState("idle");
      setRecordingSeconds(0);
      return;
    }

    setVoiceState("transcribing");
    setVoiceError("");

    try {
      const formData = new FormData();
      formData.append("text", liveTranscript);

      const response = await fetch("/api/booster/transcribe", {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          String(json?.user_message || json?.error || "Correction impossible."),
        );
      }

      const correctedText = String(json?.text || "").trim();
      if (!correctedText) {
        throw new Error("Aucun texte n’a été détecté dans le vocal.");
      }

      setIdea(() =>
        appendVoiceText(liveVoiceBaseTextRef.current, correctedText),
      );
      resetLiveVoiceDraft();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Le vocal n’a pas pu être corrigé.";
      setVoiceError(
        `${message} Le texte affiché en direct est conservé sans correction finale.`,
      );
      resetLiveVoiceDraft();
    } finally {
      setVoiceState("idle");
      setRecordingSeconds(0);
    }
  };

  const submitVoiceBlob = async (audioBlob: Blob) => {
    if (!audioBlob.size || audioBlob.size < VOICE_MIN_BYTES) {
      const liveDraftKept =
        hasLiveVoiceDraftRef.current && liveVoiceLastTextRef.current.trim();
      setVoiceError(
        liveDraftKept
          ? "Vocal trop court pour la correction finale. Le texte affiché en direct est conservé."
          : "Vocal trop court ou vide. Réessaie en parlant un peu plus longtemps.",
      );
      resetLiveVoiceDraft();
      setVoiceState("idle");
      return;
    }

    setVoiceState("transcribing");
    setVoiceError("");

    try {
      const mimeType = audioBlob.type || "audio/webm";
      const extension = voiceExtensionFromMime(mimeType);
      const audioFile = new File([audioBlob], `booster-vocal.${extension}`, {
        type: mimeType,
      });
      const formData = new FormData();
      formData.append("audio", audioFile);

      const response = await fetch("/api/booster/transcribe", {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          String(
            json?.user_message || json?.error || "Transcription impossible.",
          ),
        );
      }

      const transcript = String(json?.text || "").trim();
      if (!transcript) {
        throw new Error("Aucun texte n’a été détecté dans le vocal.");
      }

      if (hasLiveVoiceDraftRef.current) {
        setIdea(() =>
          appendVoiceText(liveVoiceBaseTextRef.current, transcript),
        );
      } else {
        setIdea((current) => appendVoiceText(current, transcript));
      }
      resetLiveVoiceDraft();
    } catch (error) {
      const liveDraftKept =
        hasLiveVoiceDraftRef.current && liveVoiceLastTextRef.current.trim();
      const message =
        error instanceof Error
          ? error.message
          : "Le vocal n’a pas pu être transcrit.";
      setVoiceError(
        liveDraftKept
          ? `${message} Le texte affiché en direct est conservé sans correction finale.`
          : message,
      );
      resetLiveVoiceDraft();
    } finally {
      setVoiceState("idle");
      setRecordingSeconds(0);
    }
  };

  const stopVoiceRecording = () => {
    const recordingMode = voiceRecordingModeRef.current;

    if (recordingMode === "liveOnly") {
      clearVoiceTimers();
      stopLiveSpeechRecognition();
      voiceRecordingModeRef.current = null;
      void submitLiveVoiceTextForCorrection();
      return;
    }

    stopLiveSpeechRecognition();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
      return;
    }
    clearVoiceTimers();
    stopMediaStream();
    voiceRecordingModeRef.current = null;
    setVoiceState("idle");
  };

  const startLiveOnlyVoiceRecording = () => {
    const started = startLiveSpeechRecognition(idea);
    if (!started) {
      liveOnlyUnavailableRef.current = true;
      return false;
    }

    voiceRecordingModeRef.current = "liveOnly";
    setRecordingSeconds(0);
    setVoiceState("recording");
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingSeconds((value) => Math.min(VOICE_MAX_SECONDS, value + 1));
    }, 1000);
    maxRecordingTimerRef.current = window.setTimeout(() => {
      stopVoiceRecording();
    }, VOICE_MAX_SECONDS * 1000);
    return true;
  };

  const startMediaVoiceRecording = async (allowLivePreview: boolean) => {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof window.MediaRecorder === "undefined"
    ) {
      setVoiceError(
        "Ce navigateur ne permet pas l’enregistrement vocal. Utilise Chrome, Edge ou Safari récent.",
      );
      return;
    }

    try {
      await warmupVoiceMicrophoneIfNeeded();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickVoiceMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      voiceRecordingModeRef.current = "media";

      recorder.ondataavailable = (event) => {
        if (event.data?.size) audioChunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setVoiceError(
          "Erreur micro pendant l’enregistrement. Réessaie dans quelques secondes.",
        );
        clearVoiceTimers();
        stopLiveSpeechRecognition();
        resetLiveVoiceDraft();
        stopMediaStream();
        voiceRecordingModeRef.current = null;
        setVoiceState("idle");
      };

      recorder.onstop = () => {
        clearVoiceTimers();
        stopMediaStream();
        const type = recorder.mimeType || mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type });
        mediaRecorderRef.current = null;
        voiceRecordingModeRef.current = null;
        audioChunksRef.current = [];
        void submitVoiceBlob(audioBlob);
      };

      recorder.start(1000);
      if (allowLivePreview) {
        startLiveSpeechRecognition(idea);
      }
      setRecordingSeconds(0);
      setVoiceState("recording");
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((value) => Math.min(VOICE_MAX_SECONDS, value + 1));
      }, 1000);
      maxRecordingTimerRef.current = window.setTimeout(() => {
        stopVoiceRecording();
      }, VOICE_MAX_SECONDS * 1000);
    } catch (error) {
      stopLiveSpeechRecognition();
      resetLiveVoiceDraft();
      stopMediaStream();
      voiceRecordingModeRef.current = null;
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setVoiceError(
          "Micro refusé. Autorise le micro dans le navigateur puis réessaie.",
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setVoiceError("Aucun micro détecté sur cet appareil.");
      } else {
        setVoiceError(
          "Impossible d’activer le micro. Vérifie l’autorisation navigateur/appareil.",
        );
      }
      setVoiceState("idle");
    }
  };

  const startVoiceRecording = async () => {
    setVoiceError("");
    stopLiveSpeechRecognition();
    resetLiveVoiceDraft();
    voiceRecordingModeRef.current = null;

    if (typeof window === "undefined" || typeof navigator === "undefined")
      return;
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setVoiceError("Le micro nécessite une connexion sécurisée HTTPS.");
      return;
    }

    const platformInfo = getVoicePlatformInfo();
    if (
      platformInfo.shouldUseLiveOnly &&
      !liveOnlyUnavailableRef.current &&
      startLiveOnlyVoiceRecording()
    ) {
      return;
    }

    await startMediaVoiceRecording(platformInfo.canUseLivePreview);
  };

  const onVoiceButtonClick = () => {
    if (voiceState === "recording") {
      stopVoiceRecording();
      return;
    }
    if (voiceState === "idle") {
      void startVoiceRecording();
    }
  };

  useEffect(() => {
    return () => {
      clearVoiceTimers();
      stopLiveSpeechRecognition();
      stopMediaStream();
      voiceRecordingModeRef.current = null;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state === "recording") recorder.stop();
    };
  }, []);

  const voiceDisabled = generating || voiceState === "transcribing";
  const generationDisabled = generating || voiceState !== "idle";
  const voiceButtonLabel =
    voiceState === "recording"
      ? `Arrêter le vocal ${formatVoiceDuration(recordingSeconds)}`
      : voiceState === "transcribing"
        ? "Correction du vocal en cours"
        : "Faire un vocal";
  const voiceButtonShortLabel =
    voiceState === "recording"
      ? `■ ${formatVoiceDuration(recordingSeconds)}`
      : voiceState === "transcribing"
        ? "…"
        : "🎙️";
  const hasImages = images.length > 0;
  const hasVideoMedia = Boolean(videoFile || videoPreviewUrl);
  const imagesLimitReached = images.length >= BOOSTER_MAX_IMAGE_COUNT;
  const pickImagesDisabled = imagesLimitReached;
  const pickVideoDisabled = hasVideoMedia;
  const cameraDisabled = !isMobile || imagesLimitReached;

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
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <div className={styles.blockTitle}>Votre intention</div>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onOpenAiConfiguration}
          style={{
            minHeight: 34,
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}
        >
          ⚙️ Configuration IA
        </button>
      </div>
      <div
        className={styles.subtitle}
        style={{ marginBottom: 10, maxWidth: "none", whiteSpace: "normal" }}
      >
        Décrivez votre idée. <strong>Ajoutez jusqu’à 5 images et 1 vidéo</strong> pour préparer
        votre publication.
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
            Phrase libre
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ position: "relative", minWidth: 0 }}>
              <textarea
                placeholder={
                  THEME_PLACEHOLDERS[theme] || THEME_PLACEHOLDERS[""]
                }
                style={{
                  ...textAreaStyle,
                  paddingRight: isMobile ? 58 : 66,
                  paddingBottom: isMobile ? 52 : 56,
                }}
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
              />
              <button
                type="button"
                className={
                  voiceState === "recording"
                    ? styles.primaryBtn
                    : styles.secondaryBtn
                }
                onClick={onVoiceButtonClick}
                disabled={voiceDisabled}
                aria-label={voiceButtonLabel}
                title="Dictez votre idée : iNrCy la transcrit et corrige les fautes."
                style={{
                  position: "absolute",
                  right: isMobile ? 10 : 12,
                  bottom: isMobile ? 10 : 12,
                  zIndex: 2,
                  minWidth:
                    voiceState === "recording"
                      ? isMobile
                        ? 82
                        : 90
                      : isMobile
                        ? 38
                        : 42,
                  height: isMobile ? 36 : 40,
                  minHeight: isMobile ? 36 : 40,
                  borderRadius: 999,
                  padding:
                    voiceState === "recording"
                      ? isMobile
                        ? "0 10px"
                        : "0 12px"
                      : 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize:
                    voiceState === "recording"
                      ? isMobile
                        ? 11
                        : 12
                      : isMobile
                        ? 16
                        : 18,
                  fontWeight: 950,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  boxShadow: "0 10px 24px rgba(0,0,0,0.28)",
                  opacity: voiceDisabled ? 0.6 : 1,
                  cursor: voiceDisabled ? "not-allowed" : "pointer",
                }}
              >
                {voiceButtonShortLabel}
              </button>
            </div>
            {voiceState === "recording" ? (
              <div
                style={{
                  fontSize: isMobile ? 11 : 12,
                  color: "#ffdfdf",
                  fontWeight: 800,
                }}
              >
                {liveVoiceEnabled
                  ? "Les mots apparaissent en direct. Recliquez sur le micro pour corriger le vocal."
                  : "Parlez maintenant, puis recliquez sur le micro pour arrêter."}
              </div>
            ) : null}
            {voiceState === "transcribing" ? (
              <div
                style={{
                  fontSize: isMobile ? 11 : 12,
                  color: "#dff6ff",
                  fontWeight: 800,
                }}
              >
                Transcription + correction en cours...
              </div>
            ) : null}
            {voiceError ? (
              <div
                style={{ fontSize: 12.5, color: "#ffb4b4", lineHeight: 1.35 }}
              >
                {voiceError}
              </div>
            ) : null}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            onImagesChange(e.target.files);
            e.currentTarget.value = "";
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.webm,.mov,.m4v"
          style={{ display: "none" }}
          onChange={(e) => {
            onVideoChange(e.target.files);
            e.currentTarget.value = "";
          }}
        />
        <div
          style={{
            display: "grid",
            gap: isMobile ? 8 : 10,
            minWidth: 0,
            padding: isMobile ? "8px 10px" : "10px 12px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.035)",
            overflow: "visible",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: isMobile ? 7 : 8,
              flexWrap: "wrap",
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
                flex: "0 0 auto",
                minHeight: isMobile ? 32 : 34,
                padding: isMobile ? "6px 9px" : "7px 12px",
                fontSize: isMobile ? 11 : 12,
                whiteSpace: "nowrap",
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
                  ? "1 vidéo maximum. Supprimez la vidéo actuelle pour la remplacer."
                  : `1 vidéo maximum · ${BOOSTER_MAX_VIDEO_MB_LABEL} max · ${BOOSTER_RECOMMENDED_VIDEO_DURATION_LABEL}`
              }
              style={{
                flex: "0 0 auto",
                minHeight: isMobile ? 32 : 34,
                padding: isMobile ? "6px 9px" : "7px 12px",
                fontSize: isMobile ? 11 : 12,
                whiteSpace: "nowrap",
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
                    ? "Ouvrir l’Appareil iNrCy en mode photo"
                    : imagesLimitReached
                      ? `${BOOSTER_MAX_IMAGE_COUNT} images maximum`
                      : hasImages
                        ? "Ouvrir l’Appareil iNrCy en mode photo"
                        : "Ouvrir l’Appareil iNrCy pour prendre une photo ou une vidéo"
              }
              style={{ display: "inline-flex", flex: "0 0 auto" }}
            >
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={!cameraDisabled ? onTakePhotoClick : undefined}
                disabled={cameraDisabled}
                aria-disabled={cameraDisabled}
                style={{
                  flex: "0 0 auto",
                  minHeight: 32,
                  padding: "6px 9px",
                  fontSize: 11,
                  whiteSpace: "nowrap",
                  opacity: cameraDisabled ? 0.48 : 1,
                  filter: cameraDisabled ? "grayscale(1)" : undefined,
                  cursor: cameraDisabled ? "not-allowed" : "pointer",
                }}
              >
                📷 Appareil iNrCy
              </button>
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: isMobile ? 7 : 8,
              flexWrap: "wrap",
            }}
          >
            {videoFile ? (
              <div
                style={{
                  flex: "0 0 auto",
                  fontSize: isMobile ? 11 : 12,
                  opacity: 0.88,
                  whiteSpace: "nowrap",
                }}
              >
                1 vidéo ajoutée · {BOOSTER_MAX_VIDEO_MB_LABEL} max · {BOOSTER_RECOMMENDED_VIDEO_DURATION_LABEL} · IA : audio + captures
              </div>
            ) : null}
            <label
              title={
                useImagesForAI
                  ? "Les images aideront iNrCy à rédiger un contenu plus précis."
                  : "Les images seront utilisées uniquement pour la publication."
              }
              style={{
                flex: "0 0 auto",
                display: "inline-flex",
                alignItems: "center",
                gap: isMobile ? 5 : 7,
                minHeight: isMobile ? 30 : 32,
                padding: isMobile ? "5px 8px" : "6px 10px",
                borderRadius: 999,
                border: useImagesForAI
                  ? "1px solid rgba(76,195,255,0.34)"
                  : "1px solid rgba(255,255,255,0.14)",
                background: useImagesForAI
                  ? "rgba(76,195,255,0.12)"
                  : "rgba(255,255,255,0.055)",
                color: useImagesForAI ? "#dff6ff" : "rgba(255,255,255,0.76)",
                fontSize: isMobile ? 10.5 : 12,
                fontWeight: 850,
                whiteSpace: "nowrap",
                cursor: images.length ? "pointer" : "default",
                userSelect: "none",
                opacity: images.length ? 1 : 0.9,
              }}
            >
              <input
                type="checkbox"
                checked={useImagesForAI}
                disabled={!images.length}
                onChange={(event) => setUseImagesForAI(event.target.checked)}
                style={{
                  width: isMobile ? 13 : 14,
                  height: isMobile ? 13 : 14,
                  margin: 0,
                  accentColor: "#4cc3ff",
                }}
              />
              {useImagesForAI
                ? "Images utilisées par l’IA"
                : "Images hors génération"}
            </label>
            <div
              style={{
                flex: "0 0 auto",
                fontSize: isMobile ? 11 : 12,
                opacity: 0.82,
                whiteSpace: "nowrap",
              }}
            >
              {images.length}/{BOOSTER_MAX_IMAGE_COUNT} image
              {images.length === 1 ? "" : "s"}
            </div>
          </div>

          {videoPreviewUrl && videoFile ? (
            <div
              style={{
                display: isMobile ? "grid" : "flex",
                alignItems: "center",
                justifyContent: isMobile ? "center" : "flex-start",
                gap: isMobile ? 10 : 12,
                padding: isMobile ? 10 : 12,
                borderRadius: 14,
                border: "1px solid rgba(76,195,255,0.22)",
                background: "rgba(76,195,255,0.08)",
                maxWidth: "100%",
              }}
            >
              <div
                style={{
                  width: isMobile ? "min(100%, 260px)" : 260,
                  maxWidth: "100%",
                  height: isMobile ? 146 : 146,
                  borderRadius: 12,
                  background: "#050816",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
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
                    borderRadius: 12,
                    background: "#050816",
                    display: "block",
                  }}
                />
              </div>
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
                  <span>IA : audio + captures</span>
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
          ) : null}

          {imagePreviews.length ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: isMobile ? 6 : 7,
                minWidth: 0,
                overflow: "visible",
                flexWrap: "wrap",
              }}
            >
              {imagePreviews.map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  title={images[index]?.name || `Image ${index + 1}`}
                  style={{
                    position: "relative",
                    width: isMobile ? 38 : 48,
                    height: isMobile ? 38 : 48,
                    flex: "0 0 auto",
                    borderRadius: 10,
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.20)",
                    background: "rgba(255,255,255,0.06)",
                  }}
                >
                  <img
                    src={url}
                    alt={`Image ${index + 1}`}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Supprimer l’image ${index + 1}`}
                    onClick={() => removeImage(index)}
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      width: isMobile ? 17 : 18,
                      height: isMobile ? 17 : 18,
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.30)",
                      background: "rgba(10,16,30,0.88)",
                      color: "#fff",
                      display: "grid",
                      placeItems: "center",
                      fontSize: isMobile ? 11 : 12,
                      fontWeight: 900,
                      lineHeight: 1,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {imgError ? (
          <div style={{ fontSize: 13, color: "#ffb4b4" }}>{imgError}</div>
        ) : null}
        {genError ? (
          <div style={{ fontSize: 13, color: "#ffb4b4" }}>{genError}</div>
        ) : null}
        <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={onGenerate}
              disabled={generationDisabled}
            >
              {generating
                ? "Génération en cours..."
                : voiceState !== "idle"
                  ? "Vocal en cours..."
                  : "Générer avec iNrCy"}
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={onReset}
            >
              Réinitialiser
            </button>
          </div>
          {generating ? (
            <div
              style={{
                width: "min(520px, 100%)",
                display: "grid",
                gap: 7,
                color: "rgba(255,255,255,0.72)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  fontSize: 12,
                  lineHeight: 1.25,
                }}
              >
                <span>{generationStage || "Génération en cours"}</span>
                <strong
                  style={{
                    color: "rgba(255,255,255,0.9)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {generationProgress}%
                </strong>
              </div>
              <div
                aria-hidden="true"
                style={{
                  height: 7,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.10)",
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${generationProgress}%`,
                    borderRadius: 999,
                    background:
                      "linear-gradient(90deg, rgba(76,195,255,0.92), rgba(99,102,241,0.95))",
                    transition: "width 420ms ease",
                  }}
                />
              </div>
              <div style={{ fontSize: 12 }}>
                {videoFile && images.length && useImagesForAI
                  ? "iNrCy analyse la vidéo, l’audio et les images, puis prépare les variantes par canal."
                  : videoFile
                    ? "iNrCy analyse l’audio et les captures de votre vidéo, puis prépare les variantes par canal."
                    : images.length && useImagesForAI
                      ? "iNrCy analyse l’intention et les images, puis prépare les variantes par canal."
                      : "iNrCy prépare les variantes adaptées à chaque canal."}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
