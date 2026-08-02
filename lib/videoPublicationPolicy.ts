import type { BoosterVideoChannelKey } from "./boosterVideoSettings.ts";
import {
  INR_MEDIA_VIDEO_SOURCE_MAX_BYTES,
  INR_MEDIA_VIDEO_SOURCE_MAX_MB_LABEL,
} from "./mediaRules.ts";
import { canPublishVideoSourceDirectly } from "./mediaVideoSourceCompatibility.ts";

export type VideoPublicationPolicy = {
  channel: BoosterVideoChannelKey;
  maxBytes: number;
  maxBytesLabel: string;
  minDurationSeconds: number | null;
  maxDurationSeconds: number | null;
  requiresMp4: boolean;
};

export type VideoPublicationValidation =
  | { ok: true; policy: VideoPublicationPolicy }
  | {
      ok: false;
      policy: VideoPublicationPolicy;
      reason:
        | "video_size_unknown"
        | "video_too_large"
        | "video_format_invalid"
        | "video_duration_unknown"
        | "video_duration_too_short"
        | "video_duration_too_long";
      message: string;
    };

const CHANNEL_LABELS: Record<BoosterVideoChannelKey, string> = {
  inrcy_site: "Site iNrCy",
  site_web: "Site web",
  inr_search: "iNr'Search",
  gmb: "Google Business",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube_shorts: "YouTube",
  pinterest: "Pinterest",
};

const DEFAULT_POLICY = {
  maxBytes: INR_MEDIA_VIDEO_SOURCE_MAX_BYTES,
  maxBytesLabel: INR_MEDIA_VIDEO_SOURCE_MAX_MB_LABEL,
  minDurationSeconds: null,
  maxDurationSeconds: null,
  requiresMp4: true,
} as const;

/**
 * Les tailles ci-dessous restent volontairement bornées par la limite source
 * iNrCy de 300 Mo. Les APIs actuellement utilisées acceptent toutes au moins
 * cette taille ; la vraie différenciation utile se fait donc surtout sur la
 * durée et le format, sans plafond global artificiel à 40 Mo.
 */
export const VIDEO_PUBLICATION_POLICY_BY_CHANNEL: Record<
  BoosterVideoChannelKey,
  VideoPublicationPolicy
> = {
  inrcy_site: { channel: "inrcy_site", ...DEFAULT_POLICY },
  site_web: { channel: "site_web", ...DEFAULT_POLICY },
  inr_search: { channel: "inr_search", ...DEFAULT_POLICY },
  gmb: { channel: "gmb", ...DEFAULT_POLICY },
  facebook: {
    channel: "facebook",
    ...DEFAULT_POLICY,
    maxDurationSeconds: 4 * 60 * 60,
  },
  instagram: {
    channel: "instagram",
    ...DEFAULT_POLICY,
    minDurationSeconds: 3,
    maxDurationSeconds: 15 * 60,
  },
  linkedin: {
    channel: "linkedin",
    ...DEFAULT_POLICY,
    minDurationSeconds: 3,
    maxDurationSeconds: 30 * 60,
  },
  tiktok: {
    channel: "tiktok",
    ...DEFAULT_POLICY,
    maxDurationSeconds: 10 * 60,
  },
  youtube_shorts: {
    channel: "youtube_shorts",
    ...DEFAULT_POLICY,
  },
  pinterest: {
    channel: "pinterest",
    ...DEFAULT_POLICY,
    minDurationSeconds: 4,
    maxDurationSeconds: 5 * 60,
  },
};

export function getVideoPublicationPolicy(
  channel: BoosterVideoChannelKey,
): VideoPublicationPolicy {
  return VIDEO_PUBLICATION_POLICY_BY_CHANNEL[channel];
}

function formatDuration(seconds: number) {
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

export function validateVideoPublicationForChannel(input: {
  channel: BoosterVideoChannelKey;
  name?: unknown;
  type?: unknown;
  mimeType?: unknown;
  storagePath?: unknown;
  sizeBytes?: unknown;
  durationSeconds?: unknown;
}): VideoPublicationValidation {
  const policy = getVideoPublicationPolicy(input.channel);
  const label = CHANNEL_LABELS[input.channel];
  const sizeBytes = Number(input.sizeBytes || 0);

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return {
      ok: false,
      policy,
      reason: "video_size_unknown",
      message: `La taille de la vidéo ${label} est inconnue. Relancez sa préparation.`,
    };
  }

  if (sizeBytes > policy.maxBytes) {
    return {
      ok: false,
      policy,
      reason: "video_too_large",
      message: `La vidéo ${label} dépasse ${policy.maxBytesLabel}, limite source iNrCy.`,
    };
  }

  if (
    policy.requiresMp4 &&
    !canPublishVideoSourceDirectly({
      name: input.name,
      type: input.type,
      mimeType: input.mimeType,
      storagePath: input.storagePath,
      sizeBytes,
      maxBytes: policy.maxBytes,
    })
  ) {
    return {
      ok: false,
      policy,
      reason: "video_format_invalid",
      message: `La vidéo ${label} doit être préparée en MP4 compatible avant publication.`,
    };
  }

  const durationSeconds = Number(input.durationSeconds || 0);
  const hasDurationConstraint =
    policy.minDurationSeconds !== null || policy.maxDurationSeconds !== null;
  if (
    hasDurationConstraint &&
    (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
  ) {
    return {
      ok: false,
      policy,
      reason: "video_duration_unknown",
      message: `La durée de la vidéo ${label} est inconnue. Relancez sa préparation.`,
    };
  }

  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    if (
      policy.minDurationSeconds !== null &&
      durationSeconds < policy.minDurationSeconds
    ) {
      return {
        ok: false,
        policy,
        reason: "video_duration_too_short",
        message: `La vidéo ${label} doit durer au moins ${formatDuration(policy.minDurationSeconds)}.`,
      };
    }
    if (
      policy.maxDurationSeconds !== null &&
      durationSeconds > policy.maxDurationSeconds
    ) {
      return {
        ok: false,
        policy,
        reason: "video_duration_too_long",
        message: `La vidéo ${label} dépasse la durée maximale de ${formatDuration(policy.maxDurationSeconds)}.`,
      };
    }
  }

  return { ok: true, policy };
}
