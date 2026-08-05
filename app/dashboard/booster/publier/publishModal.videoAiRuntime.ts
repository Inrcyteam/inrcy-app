"use client";

import {
  cleanupPreparedVideoAudioStorage,
  prepareVideoAudioTransport,
} from "@/lib/boosterVideoAudioClient";
import type { BoosterVideoSourceMetadata } from "./publishModal.shared";
import {
  VIDEO_TRANSCRIPTION_TIMEOUT_MS,
  buildVideoFileName,
  buildVideoOrientation,
  buildVideoRatioLabel,
  getVideoOrientationLabel,
  type VideoAudioTranscriptCache,
} from "./publishModal.foundations";

const FAST_GENERATION_AUDIO_MAX_BYTES = 3_750_000;

export function preloadPreparedImagePreview(url: string, timeoutMs = 8_000) {
  if (typeof window === "undefined" || !url) {
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    const image = new window.Image();
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      resolve(loaded);
    };
    const timeoutId = window.setTimeout(() => finish(false), timeoutMs);
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.decoding = "async";
    image.src = url;
  });
}

export function readVideoSourceMetadata(
  file: File,
): Promise<BoosterVideoSourceMetadata> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    let timeoutId: number | null = null;

    const cleanup = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };

    const finish = (partial?: Partial<BoosterVideoSourceMetadata>) => {
      if (settled) return;
      settled = true;
      const width = Number(partial?.width ?? video.videoWidth ?? 0) || null;
      const height = Number(partial?.height ?? video.videoHeight ?? 0) || null;
      const rawDuration = Number(partial?.duration ?? video.duration ?? 0);
      const duration =
        Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : null;
      const orientation = buildVideoOrientation(width, height);
      cleanup();
      resolve({
        width,
        height,
        duration,
        size: file.size,
        type: file.type || "video/mp4",
        ratio: width && height ? width / height : null,
        ratioLabel: buildVideoRatioLabel(width, height),
        orientation,
        orientationLabel: getVideoOrientationLabel(orientation),
      });
    };

    video.preload = "metadata";
    video.onloadedmetadata = () => finish();
    video.onerror = () => finish();
    timeoutId = window.setTimeout(() => finish(), 5500);
    video.src = url;
    video.load();
  });
}

export async function transcribeVideoAudioForAI(
  file: File,
  preparedAudio: File | null,
  timeoutMs = VIDEO_TRANSCRIPTION_TIMEOUT_MS,
): Promise<Omit<VideoAudioTranscriptCache, "key"> | null> {
  let storagePathToCleanup = "";
  let requestBody: BodyInit;
  let requestHeaders: HeadersInit | undefined;

  try {
    if (preparedAudio) {
      // Le mode Générer ne lance jamais un upload audio secondaire : au-delà
      // du transport direct, la phrase + les captures vidéo suffisent.
      if (preparedAudio.size > FAST_GENERATION_AUDIO_MAX_BYTES) return null;
      const transport = await prepareVideoAudioTransport(preparedAudio);
      if (transport.mode === "storage") {
        storagePathToCleanup = transport.storagePath;
        requestHeaders = { "Content-Type": "application/json" };
        requestBody = JSON.stringify({
          origin: "video",
          audioStoragePath: transport.storagePath,
          audioName: transport.name,
          audioType: transport.type,
          audioSize: transport.size,
          videoName: buildVideoFileName(file),
          mode: "generation_fast",
        });
      } else {
        const formData = new FormData();
        formData.append("audio", transport.file, transport.file.name);
        formData.append("origin", "video");
        formData.append("mode", "generation_fast");
        formData.append("video_name", buildVideoFileName(file));
        requestBody = formData;
      }
    } else {
      // Ne jamais envoyer le conteneur vidéo complet à /transcribe depuis le
      // parcours rapide : FFmpeg pourrait continuer après l'abandon du navigateur.
      return null;
    }
  } catch {
    if (storagePathToCleanup) {
      void cleanupPreparedVideoAudioStorage(storagePathToCleanup);
    }
    return null;
  }

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId =
    controller && typeof window !== "undefined"
      ? window.setTimeout(
          () => controller.abort(),
          Math.max(1_000, timeoutMs),
        )
      : null;

  try {
    const res = await fetch("/api/booster/transcribe", {
      method: "POST",
      headers: {
        ...(requestHeaders || {}),
        "x-inrcy-transcription-mode": "generation-fast",
      },
      body: requestBody,
      ...(controller ? { signal: controller.signal } : {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return null;

    const text = String(json?.text || "").trim();
    if (!text) return null;
    return {
      text,
      rawText: String(json?.raw_text || text).trim() || text,
    };
  } catch {
    if (storagePathToCleanup) {
      void cleanupPreparedVideoAudioStorage(storagePathToCleanup);
    }
    return null;
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
}
