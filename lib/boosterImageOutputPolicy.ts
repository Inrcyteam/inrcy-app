import type { BoosterImageChannel } from "@/lib/boosterImageDecision";

export const BOOSTER_ORIGINAL_ALPHA_PRESERVING_CHANNELS = Object.freeze([
  "inrcy_site",
  "site_web",
  "inr_search",
] satisfies BoosterImageChannel[]);

const ALPHA_PRESERVING_CHANNELS = new Set<BoosterImageChannel>(
  BOOSTER_ORIGINAL_ALPHA_PRESERVING_CHANNELS,
);

export function getBoosterOriginalPublicationExtension(params: {
  channel: BoosterImageChannel;
  sourceMime: string;
}): "png" | "jpg" {
  const mime = String(params.sourceMime || "").toLowerCase();
  return ALPHA_PRESERVING_CHANNELS.has(params.channel) &&
    (mime.includes("png") || mime.includes("webp") || mime.includes("avif"))
    ? "png"
    : "jpg";
}

export function shouldPreserveBoosterOriginalAlpha(params: {
  channel: BoosterImageChannel;
  sourceMime: string;
}) {
  return getBoosterOriginalPublicationExtension(params) === "png";
}
