import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  AI_ENGINE_OPTIONS,
  getAiEngineOption,
  type AiPreferredEngine,
} from "@/lib/aiEnginePreference";
import AiEngineInfoModal from "../../../_components/AiEngineInfoModal";
import {
  BOOSTER_MAX_IMAGE_COUNT,
  BOOSTER_IMAGE_ACCEPT,
  BOOSTER_MAX_MEDIA_MB_LABEL,
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
type VoiceTarget = "idea" | "instruction";

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
  publicationInstruction: string;
  setPublicationInstruction: Dispatch<SetStateAction<string>>;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  videoInputRef: MutableRefObject<HTMLInputElement | null>;
  onImagesChange: (files: FileList | null) => void;
  onVideoChange: (files: FileList | null) => void;
  onPickImagesClick: () => void;
  onPickVideoClick: () => void;
  onTakePhotoClick: () => void;
  onOpenMediaLibrary: () => void;
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
  generationNotice: string;
  generating: boolean;
  generationStage: string;
  generationProgress: number;
  aiPreferredEngine: AiPreferredEngine;
  defaultAiPreferredEngine: AiPreferredEngine;
  onAiPreferredEngineChange: (engine: AiPreferredEngine) => void;
  onGenerate: () => void;
  onReset: () => void;
  onCreateManually: () => void;
  onOpenAiConfiguration: () => void;
};

export default function PublishIntentPanel({
  styles,
  isMobile,
  theme,
  idea,
  setIdea,
  publicationInstruction,
  setPublicationInstruction,
  fileInputRef,
  videoInputRef,
  onImagesChange,
  onVideoChange,
  onPickImagesClick,
  onPickVideoClick,
  onTakePhotoClick,
  onOpenMediaLibrary,
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
  generationNotice,
  generating,
  generationStage,
  generationProgress,
  aiPreferredEngine,
  defaultAiPreferredEngine,
  onAiPreferredEngineChange,
  onGenerate,
  onReset,
  onCreateManually,
  onOpenAiConfiguration,
}: PublishIntentPanelProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceTarget, setVoiceTarget] = useState<VoiceTarget | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const [voiceErrorTarget, setVoiceErrorTarget] = useState<VoiceTarget>("idea");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [mobileInstructionExpanded, setMobileInstructionExpanded] =
    useState(false);
  const [engineInfoOpen, setEngineInfoOpen] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceRecordingModeRef = useRef<VoiceRecordingMode | null>(null);
  const voiceTargetRef = useRef<VoiceTarget | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const maxRecordingTimerRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<VoiceSpeechRecognition | null>(null);
  const liveVoiceBaseTextRef = useRef("");
  const liveVoiceLastTextRef = useRef("");
  const hasLiveVoiceDraftRef = useRef(false);
  const liveOnlyUnavailableRef = useRef(false);
  const [liveVoiceEnabled, setLiveVoiceEnabled] = useState(false);
  const selectedAiEngineOption = getAiEngineOption(aiPreferredEngine);

  const setVoiceTargetText = (
    target: VoiceTarget,
    updater: SetStateAction<string>,
  ) => {
    if (target === "idea") {
      setIdea(updater);
      return;
    }
    setPublicationInstruction(updater);
  };

  const getVoiceTargetText = (target: VoiceTarget) =>
    target === "idea" ? idea : publicationInstruction;

  const setTargetedVoiceError = (target: VoiceTarget, message: string) => {
    setVoiceErrorTarget(target);
    setVoiceError(message);
  };

  const clearVoiceTarget = () => {
    voiceTargetRef.current = null;
    setVoiceTarget(null);
  };

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

  const startLiveSpeechRecognition = (
    baseText: string,
    target: VoiceTarget,
  ) => {
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
        setVoiceTargetText(target, () =>
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
          setTargetedVoiceError(
            target,
            "Dictée en direct indisponible sur ce navigateur. Réessaie : iNrCy basculera sur le vocal classique.",
          );
          clearVoiceTarget();
        }
      };

      recognition.onend = () => {
        speechRecognitionRef.current = null;
        setLiveVoiceEnabled(false);
        if (voiceRecordingModeRef.current === "liveOnly") {
          clearVoiceTimers();
          voiceRecordingModeRef.current = null;
          void submitLiveVoiceTextForCorrection(target);
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

  const submitLiveVoiceTextForCorrection = async (target: VoiceTarget) => {
    const liveTranscript = cleanTranscriptTextForSubmission(
      liveVoiceLastTextRef.current,
    );
    if (!liveTranscript) {
      setTargetedVoiceError(
        target,
        "Aucun texte n’a été détecté pendant le vocal. Réessaie en parlant un peu plus longtemps.",
      );
      resetLiveVoiceDraft();
      setVoiceState("idle");
      setRecordingSeconds(0);
      clearVoiceTarget();
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

      setVoiceTargetText(target, () =>
        appendVoiceText(liveVoiceBaseTextRef.current, correctedText),
      );
      resetLiveVoiceDraft();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Le vocal n’a pas pu être corrigé.";
      setTargetedVoiceError(
        target,
        `${message} Le texte affiché en direct est conservé sans correction finale.`,
      );
      resetLiveVoiceDraft();
    } finally {
      setVoiceState("idle");
      setRecordingSeconds(0);
      clearVoiceTarget();
    }
  };

  const submitVoiceBlob = async (audioBlob: Blob, target: VoiceTarget) => {
    if (!audioBlob.size || audioBlob.size < VOICE_MIN_BYTES) {
      const liveDraftKept =
        hasLiveVoiceDraftRef.current && liveVoiceLastTextRef.current.trim();
      setTargetedVoiceError(
        target,
        liveDraftKept
          ? "Vocal trop court pour la correction finale. Le texte affiché en direct est conservé."
          : "Vocal trop court ou vide. Réessaie en parlant un peu plus longtemps.",
      );
      resetLiveVoiceDraft();
      setVoiceState("idle");
      clearVoiceTarget();
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
        setVoiceTargetText(target, () =>
          appendVoiceText(liveVoiceBaseTextRef.current, transcript),
        );
      } else {
        setVoiceTargetText(target, (current) =>
          appendVoiceText(current, transcript),
        );
      }
      resetLiveVoiceDraft();
    } catch (error) {
      const liveDraftKept =
        hasLiveVoiceDraftRef.current && liveVoiceLastTextRef.current.trim();
      const message =
        error instanceof Error
          ? error.message
          : "Le vocal n’a pas pu être transcrit.";
      setTargetedVoiceError(
        target,
        liveDraftKept
          ? `${message} Le texte affiché en direct est conservé sans correction finale.`
          : message,
      );
      resetLiveVoiceDraft();
    } finally {
      setVoiceState("idle");
      setRecordingSeconds(0);
      clearVoiceTarget();
    }
  };

  const stopVoiceRecording = () => {
    const recordingMode = voiceRecordingModeRef.current;

    if (recordingMode === "liveOnly") {
      clearVoiceTimers();
      stopLiveSpeechRecognition();
      voiceRecordingModeRef.current = null;
      const target = voiceTargetRef.current || "idea";
      void submitLiveVoiceTextForCorrection(target);
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
    clearVoiceTarget();
  };

  const startLiveOnlyVoiceRecording = (target: VoiceTarget) => {
    const started = startLiveSpeechRecognition(
      getVoiceTargetText(target),
      target,
    );
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

  const startMediaVoiceRecording = async (
    allowLivePreview: boolean,
    target: VoiceTarget,
  ) => {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof window.MediaRecorder === "undefined"
    ) {
      setTargetedVoiceError(
        target,
        "Ce navigateur ne permet pas l’enregistrement vocal. Utilise Chrome, Edge ou Safari récent.",
      );
      setVoiceState("idle");
      clearVoiceTarget();
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
        setTargetedVoiceError(
          target,
          "Erreur micro pendant l’enregistrement. Réessaie dans quelques secondes.",
        );
        clearVoiceTimers();
        stopLiveSpeechRecognition();
        resetLiveVoiceDraft();
        stopMediaStream();
        voiceRecordingModeRef.current = null;
        setVoiceState("idle");
        clearVoiceTarget();
      };

      recorder.onstop = () => {
        clearVoiceTimers();
        stopMediaStream();
        const type = recorder.mimeType || mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type });
        mediaRecorderRef.current = null;
        voiceRecordingModeRef.current = null;
        audioChunksRef.current = [];
        void submitVoiceBlob(audioBlob, target);
      };

      recorder.start(1000);
      if (allowLivePreview) {
        startLiveSpeechRecognition(getVoiceTargetText(target), target);
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
        setTargetedVoiceError(
          target,
          "Micro refusé. Autorise le micro dans le navigateur puis réessaie.",
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setTargetedVoiceError(target, "Aucun micro détecté sur cet appareil.");
      } else {
        setTargetedVoiceError(
          target,
          "Impossible d’activer le micro. Vérifie l’autorisation navigateur/appareil.",
        );
      }
      setVoiceState("idle");
      clearVoiceTarget();
    }
  };

  const startVoiceRecording = async (target: VoiceTarget) => {
    setVoiceErrorTarget(target);
    setVoiceError("");
    voiceTargetRef.current = target;
    setVoiceTarget(target);
    stopLiveSpeechRecognition();
    resetLiveVoiceDraft();
    voiceRecordingModeRef.current = null;

    if (typeof window === "undefined" || typeof navigator === "undefined")
      return;
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setTargetedVoiceError(
        target,
        "Le micro nécessite une connexion sécurisée HTTPS.",
      );
      clearVoiceTarget();
      return;
    }

    const platformInfo = getVoicePlatformInfo();
    if (
      platformInfo.shouldUseLiveOnly &&
      !liveOnlyUnavailableRef.current &&
      startLiveOnlyVoiceRecording(target)
    ) {
      return;
    }

    await startMediaVoiceRecording(platformInfo.canUseLivePreview, target);
  };

  const onVoiceButtonClick = (target: VoiceTarget) => {
    if (voiceState === "recording" && voiceTarget === target) {
      stopVoiceRecording();
      return;
    }
    if (voiceState === "idle") {
      void startVoiceRecording(target);
    }
  };

  useEffect(() => {
    return () => {
      clearVoiceTimers();
      stopLiveSpeechRecognition();
      stopMediaStream();
      voiceRecordingModeRef.current = null;
      voiceTargetRef.current = null;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state === "recording") recorder.stop();
    };
  }, []);

  const generationDisabled = generating || voiceState !== "idle";
  const isVoiceTargetDisabled = (target: VoiceTarget) =>
    generating ||
    voiceState === "transcribing" ||
    (voiceState === "recording" && voiceTarget !== target);
  const getVoiceButtonLabel = (target: VoiceTarget) =>
    voiceTarget === target && voiceState === "recording"
      ? `Arrêter le vocal ${formatVoiceDuration(recordingSeconds)}`
      : voiceTarget === target && voiceState === "transcribing"
        ? "Correction du vocal en cours"
        : target === "idea"
          ? "Dicter le sujet"
          : "Dicter la consigne ponctuelle";
  const getVoiceButtonShortLabel = (target: VoiceTarget) =>
    voiceTarget === target && voiceState === "recording"
      ? `■ ${formatVoiceDuration(recordingSeconds)}`
      : voiceTarget === target && voiceState === "transcribing"
        ? "…"
        : "🎙️";

  const renderIntentField = (args: {
    target: VoiceTarget;
    label: string;
    helper: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    maxLength?: number;
  }) => {
    const targetActive = voiceTarget === args.target;
    const voiceDisabled = isVoiceTargetDisabled(args.target);
    return (
      <div style={{ minWidth: 0, display: "grid", alignContent: "start" }}>
        <div
          style={{
            minHeight: isMobile ? 34 : 38,
            marginBottom: 6,
            display: "grid",
            alignContent: "start",
            gap: 2,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.94 }}>
            {args.label}
          </div>
          <div style={{ fontSize: 10.5, opacity: 0.68, lineHeight: 1.2 }}>
            {args.helper}
          </div>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ position: "relative", minWidth: 0 }}>
            <textarea
              placeholder={args.placeholder}
              style={{
                ...textAreaStyle,
                minHeight: isMobile ? 104 : 130,
                paddingRight: isMobile ? 58 : 66,
                paddingBottom: isMobile ? 52 : 56,
              }}
              value={args.value}
              maxLength={args.maxLength}
              onChange={(event) => args.onChange(event.target.value)}
            />
            <button
              type="button"
              className={
                targetActive && voiceState === "recording"
                  ? styles.primaryBtn
                  : styles.secondaryBtn
              }
              onClick={() => onVoiceButtonClick(args.target)}
              disabled={voiceDisabled}
              aria-label={getVoiceButtonLabel(args.target)}
              title={
                args.target === "idea"
                  ? "Dictez le sujet : iNrCy le transcrit et corrige les fautes."
                  : "Dictez la consigne ponctuelle : iNrCy la transcrit et corrige les fautes."
              }
              style={{
                position: "absolute",
                right: isMobile ? 10 : 12,
                bottom: isMobile ? 10 : 12,
                zIndex: 2,
                minWidth:
                  targetActive && voiceState === "recording"
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
                  targetActive && voiceState === "recording"
                    ? isMobile
                      ? "0 10px"
                      : "0 12px"
                    : 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize:
                  targetActive && voiceState === "recording"
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
              {getVoiceButtonShortLabel(args.target)}
            </button>
          </div>
          {targetActive && voiceState === "recording" ? (
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
          {targetActive && voiceState === "transcribing" ? (
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
          {voiceError && voiceErrorTarget === args.target ? (
            <div
              style={{ fontSize: 12.5, color: "#ffb4b4", lineHeight: 1.35 }}
            >
              {voiceError}
            </div>
          ) : null}
        </div>
      </div>
    );
  };
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
        <div
          className={styles.blockTitle}
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              display: "inline-grid",
              placeItems: "center",
              border: "1px solid rgba(76,195,255,0.38)",
              background: "rgba(76,195,255,0.12)",
              color: "#dff6ff",
              fontSize: 12,
              fontWeight: 950,
              flex: "0 0 auto",
            }}
          >
            2
          </span>
          Votre intention
        </div>
      </div>
      <div
        className={styles.subtitle}
        style={{ marginBottom: 10, maxWidth: "none", whiteSpace: "normal" }}
      >
        Décrivez le sujet de cette publication et ajoutez, si nécessaire, une
        consigne ponctuelle prioritaire. {" "}
        <strong>Ajoutez jusqu’à 5 images ou 1 vidéo</strong> pour préparer votre
        publication.
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "minmax(0, 1fr)"
              : "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 10,
            alignItems: "start",
            minWidth: 0,
          }}
        >
          {renderIntentField({
            target: "idea",
            label: "Sujet de la publication — obligatoire pour l’IA",
            helper: "Le thème et les faits à traiter dans cette actualité.",
            placeholder:
              THEME_PLACEHOLDERS[theme] || THEME_PLACEHOLDERS[""],
            value: idea,
            onChange: setIdea,
          })}

          {isMobile ? (
            <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() =>
                  setMobileInstructionExpanded((current) => !current)
                }
                aria-expanded={mobileInstructionExpanded}
                style={{
                  width: "100%",
                  minHeight: 38,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "7px 11px",
                  borderRadius: 12,
                  textAlign: "left",
                  fontSize: 12,
                  fontWeight: 850,
                }}
              >
                <span>
                  {publicationInstruction.trim()
                    ? "✓ Consigne ajoutée — Modifier"
                    : "+ Ajouter une consigne à l’IA"}
                </span>
                <span aria-hidden="true">
                  {mobileInstructionExpanded ? "▴" : "▾"}
                </span>
              </button>
              {mobileInstructionExpanded
                ? renderIntentField({
                    target: "instruction",
                    label: "Consigne ponctuelle à l’IA — facultatif",
                    helper:
                      "Prioritaire sur votre Configuration IA pour cette publication uniquement.",
                    placeholder:
                      "Ex. : insistez sur la personnalisation, rédigez en espagnol, sans emoji, et terminez par une question.",
                    value: publicationInstruction,
                    onChange: setPublicationInstruction,
                    maxLength: 4_000,
                  })
                : null}
            </div>
          ) : (
            renderIntentField({
              target: "instruction",
              label: "Consigne ponctuelle à l’IA — facultatif",
              helper:
                "Prioritaire sur votre Configuration IA pour cette publication uniquement.",
              placeholder:
                "Ex. : insistez sur la personnalisation, rédigez en espagnol, sans emoji, et terminez par une question.",
              value: publicationInstruction,
              onChange: setPublicationInstruction,
              maxLength: 4_000,
            })
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={BOOSTER_IMAGE_ACCEPT}
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
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={onOpenMediaLibrary}
              title="Ajouter depuis la Médiathèque"
              style={{
                flex: "0 0 auto",
                minHeight: isMobile ? 32 : 34,
                padding: isMobile ? "6px 9px" : "7px 12px",
                fontSize: isMobile ? 11 : 12,
                whiteSpace: "nowrap",
              }}
            >
              🖼️ Médiathèque
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
            <div
              style={{
                flex: "1 1 100%",
                minWidth: 0,
                fontSize: isMobile ? 10.5 : 12,
                opacity: hasImages || hasVideoMedia ? 0.85 : 0.7,
                lineHeight: 1.45,
                overflowWrap: "anywhere",
              }}
            >
              {hasImages || hasVideoMedia
                ? `${images.length}/${BOOSTER_MAX_IMAGE_COUNT} image${images.length > 1 ? "s" : ""} · ${BOOSTER_MAX_MEDIA_MB_LABEL} max au total${hasVideoMedia ? ` · 1 vidéo · IA vidéo + audio · ${BOOSTER_MAX_VIDEO_MB_LABEL} max · ${BOOSTER_RECOMMENDED_VIDEO_DURATION_LABEL}` : ""}`
                : `Aucun média ajouté · ${BOOSTER_MAX_IMAGE_COUNT} images max (${BOOSTER_MAX_MEDIA_MB_LABEL} total) ou 1 vidéo (${BOOSTER_MAX_VIDEO_MB_LABEL} max)`}
            </div>
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
                width: "100%",
                maxWidth: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: isMobile ? "100%" : 260,
                  maxWidth: isMobile ? "min(100%, 260px)" : "100%",
                  marginInline: isMobile ? "auto" : undefined,
                  justifySelf: isMobile ? "center" : undefined,
                  alignSelf: isMobile ? "center" : undefined,
                  aspectRatio: "16 / 9",
                  height: "auto",
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
                  display: "flex",
                  alignItems: "center",
                  justifyContent: isMobile ? "center" : "space-between",
                  gap: 8,
                  minWidth: 0,
                  width: isMobile ? "100%" : "min(360px, 100%)",
                  textAlign: isMobile ? "center" : "left",
                }}
              >
                <strong
                  style={{
                    fontSize: isMobile ? 11 : 12,
                    maxWidth: isMobile ? 230 : 300,
                    overflowWrap: "anywhere",
                    lineHeight: 1.25,
                  }}
                >
                  {videoFile.name}
                </strong>
                <button
                  type="button"
                  aria-label="Supprimer la vidéo"
                  title="Supprimer la vidéo"
                  onClick={removeVideo}
                  style={{
                    flex: "0 0 auto",
                    width: isMobile ? 30 : 32,
                    height: isMobile ? 30 : 32,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.22)",
                    background: "rgba(255,255,255,0.10)",
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    fontSize: isMobile ? 13 : 14,
                    boxShadow: "0 8px 18px rgba(0,0,0,0.22)",
                  }}
                >
                  🗑️
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
        {generationNotice ? (
          <div
            role="status"
            style={{
              fontSize: 13,
              lineHeight: 1.4,
              color: "#dff6ff",
              border: "1px solid rgba(126, 220, 255, 0.28)",
              background: "rgba(78, 177, 220, 0.10)",
              borderRadius: 10,
              padding: "8px 10px",
            }}
          >
            {generationNotice}
          </div>
        ) : null}
        <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
          <div
              style={{
                display: "grid",
                gap: 4,
                width: isMobile ? "100%" : "min(470px, 100%)",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "auto minmax(220px, 320px)",
                  alignItems: "center",
                  gap: isMobile ? 5 : 8,
                  color: "rgba(255,255,255,0.84)",
                  fontSize: 12.5,
                  fontWeight: 850,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  minWidth: 0,
                }}
              >
                <span style={{ whiteSpace: "nowrap" }}>Moteur IA</span>
                <button
                  type="button"
                  onClick={() => setEngineInfoOpen(true)}
                  aria-label="Informations sur les moteurs IA"
                  title="Informations sur les moteurs IA"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    border: "1px solid rgba(125,211,252,0.44)",
                    background: "rgba(125,211,252,0.12)",
                    color: "#bae6fd",
                    display: "inline-grid",
                    placeItems: "center",
                    padding: 0,
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 950,
                    lineHeight: 1,
                  }}
                >
                  i
                </button>
              </div>
              <select
                value={aiPreferredEngine}
                onChange={(event) =>
                  onAiPreferredEngineChange(
                    event.target.value as AiPreferredEngine,
                  )
                }
                disabled={generationDisabled}
                style={{
                  width: "100%",
                  minHeight: isMobile ? 36 : 38,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.055)",
                  color: "white",
                  padding: isMobile ? "7px 10px" : "8px 11px",
                  fontSize: 13,
                  fontWeight: 800,
                  outline: "none",
                  opacity: generationDisabled ? 0.68 : 1,
                  cursor: generationDisabled ? "wait" : "pointer",
                }}
              >
                {AI_ENGINE_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    style={{ color: "#0b1020", background: "#ffffff" }}
                  >
                    {option.label}
                    {option.value === defaultAiPreferredEngine
                      ? " — défaut"
                      : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className={`${styles.primaryBtn} ${styles.aiGenerateBtn}`}
              onClick={onGenerate}
              disabled={generationDisabled}
            >
              {generating
                ? `Génération avec ${selectedAiEngineOption.shortLabel}...`
                : voiceState !== "idle"
                  ? "Vocal en cours..."
                  : "✨ Générer avec iNrCy"}
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={onReset}
            >
              Réinitialiser
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={onCreateManually}
              disabled={generationDisabled}
              style={{
                opacity: generationDisabled ? 0.6 : 1,
                cursor: generationDisabled ? "wait" : "pointer",
              }}
            >
              Créer manuellement
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
      <AiEngineInfoModal
        open={engineInfoOpen}
        activeEngine={aiPreferredEngine}
        onClose={() => setEngineInfoOpen(false)}
      />
    </div>
  );
}
