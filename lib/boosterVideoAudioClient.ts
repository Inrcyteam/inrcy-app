const DEFAULT_TARGET_SAMPLE_RATE = 16_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TRANSCRIPTION_AUDIO_BYTES = 24 * 1024 * 1024;
const MIN_TRANSCRIPTION_AUDIO_BYTES = 900;
const DIRECT_FUNCTION_AUDIO_BYTES = 3_750_000;

export type PreparedVideoAudioTransport =
  | { mode: "direct"; file: File }
  | { mode: "storage"; storagePath: string; name: string; type: string; size: number };

type BrowserAudioContextConstructor = new () => AudioContext;

type BrowserWindowWithWebkitAudio = Window &
  typeof globalThis & {
    webkitAudioContext?: BrowserAudioContextConstructor;
  };

function getAudioContextConstructor(): BrowserAudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const browserWindow = window as BrowserWindowWithWebkitAudio;
  return browserWindow.AudioContext || browserWindow.webkitAudioContext || null;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function encodeMonoPcm16Wav(
  samples: Float32Array,
  sampleRate = DEFAULT_TARGET_SAMPLE_RATE,
): Blob {
  const normalizedSampleRate = Math.max(8_000, Math.round(sampleRate));
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, normalizedSampleRate, true);
  view.setUint32(28, normalizedSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] || 0));
    view.setInt16(
      offset,
      sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff),
      true,
    );
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (typeof window === "undefined") return promise;
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error("Extraction audio locale trop longue.")),
      Math.max(1_000, timeoutMs),
    );
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function buildAudioFileName(file: Pick<File, "name">) {
  const baseName =
    String(file.name || "video-inrcy")
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.[^.]+$/, "") || "video-inrcy";
  return `${baseName}-audio.wav`;
}

async function prepareStorageUpload(file: File) {
  const response = await fetch("/api/booster/transcription-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      type: file.type || "audio/wav",
      size: file.size,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      String(json?.error || "Impossible de préparer l'upload audio."),
    );
  }
  const storagePath = String(json?.storagePath || json?.path || "").trim();
  const token = String(json?.token || "").trim();
  if (!storagePath || !token) {
    throw new Error("Jeton d'upload audio manquant.");
  }
  return {
    storagePath,
    token,
    contentType: String(json?.contentType || file.type || "audio/wav"),
  };
}

export async function prepareVideoAudioTransport(
  file: File,
): Promise<PreparedVideoAudioTransport> {
  if (file.size <= DIRECT_FUNCTION_AUDIO_BYTES) {
    return { mode: "direct", file };
  }

  const prepared = await prepareStorageUpload(file);
  const { createClient } = await import("@/lib/supabaseClient");
  const supabase = createClient();
  const { error } = await supabase.storage
    .from("booster")
    .uploadToSignedUrl(prepared.storagePath, prepared.token, file, {
      contentType: prepared.contentType,
    });
  if (error) {
    throw new Error(error.message || "Impossible d'uploader l'audio extrait.");
  }

  return {
    mode: "storage",
    storagePath: prepared.storagePath,
    name: file.name,
    type: prepared.contentType,
    size: file.size,
  };
}

export async function cleanupPreparedVideoAudioStorage(storagePath: string) {
  const path = String(storagePath || "").trim();
  if (!path) return;
  await fetch("/api/booster/transcription-upload-url", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storagePath: path }),
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * Extrait localement la piste parlée d'une vidéo et la convertit en WAV mono
 * 16 kHz. Le format est volontairement identique aux paramètres FFmpeg déjà
 * utilisés côté serveur pour la reconnaissance vocale, mais sans envoyer la
 * vidéo complète à la Function Vercel.
 */
export async function extractVideoAudioForTranscription(
  file: File,
  options?: {
    targetSampleRate?: number;
    timeoutMs?: number;
  },
): Promise<File> {
  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor || typeof OfflineAudioContext === "undefined") {
    throw new Error("Extraction audio locale indisponible dans ce navigateur.");
  }

  const targetSampleRate = Math.max(
    8_000,
    Math.min(48_000, Math.round(options?.targetSampleRate || DEFAULT_TARGET_SAMPLE_RATE)),
  );
  const timeoutMs = options?.timeoutMs || DEFAULT_TIMEOUT_MS;
  const audioContext = new AudioContextConstructor();

  try {
    const sourceBuffer = await file.arrayBuffer();
    const decoded = await withTimeout(
      audioContext.decodeAudioData(sourceBuffer),
      timeoutMs,
    );

    if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) {
      throw new Error("Aucune piste audio exploitable dans la vidéo.");
    }

    const targetFrames = Math.max(1, Math.ceil(decoded.duration * targetSampleRate));
    const estimatedBytes = 44 + targetFrames * 2;
    if (estimatedBytes > MAX_TRANSCRIPTION_AUDIO_BYTES) {
      throw new Error("La piste audio extraite dépasserait la limite de transcription.");
    }

    const offlineContext = new OfflineAudioContext(
      1,
      targetFrames,
      targetSampleRate,
    );
    const source = offlineContext.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineContext.destination);
    source.start(0);

    const rendered = await withTimeout(offlineContext.startRendering(), timeoutMs);
    const wavBlob = encodeMonoPcm16Wav(
      rendered.getChannelData(0),
      targetSampleRate,
    );

    if (wavBlob.size < MIN_TRANSCRIPTION_AUDIO_BYTES) {
      throw new Error("Piste audio vide ou trop courte.");
    }
    if (wavBlob.size > MAX_TRANSCRIPTION_AUDIO_BYTES) {
      throw new Error("Piste audio extraite trop volumineuse.");
    }

    return new File([wavBlob], buildAudioFileName(file), {
      type: "audio/wav",
      lastModified: file.lastModified || Date.now(),
    });
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}
