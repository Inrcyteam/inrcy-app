export const TIKTOK_MAX_SINGLE_CHUNK_BYTES = 64 * 1024 * 1024;
export const TIKTOK_DEFAULT_CHUNK_BYTES = 32 * 1024 * 1024;

export type TikTokVideoUploadPlan = {
  chunkSize: number;
  totalChunkCount: number;
};

export function buildTikTokVideoUploadPlan(
  videoSize: number,
): TikTokVideoUploadPlan {
  const safeSize = Math.max(0, Math.floor(Number(videoSize) || 0));
  if (safeSize <= TIKTOK_MAX_SINGLE_CHUNK_BYTES) {
    return {
      chunkSize: safeSize,
      totalChunkCount: safeSize > 0 ? 1 : 0,
    };
  }

  // TikTok demande floor(video_size / chunk_size), puis fusionne le reliquat
  // dans le dernier morceau. Avec 32 Mo, le dernier reste toujours sous 64 Mo
  // et chaque envoi respecte largement la borne minimale de 5 Mo.
  return {
    chunkSize: TIKTOK_DEFAULT_CHUNK_BYTES,
    totalChunkCount: Math.floor(safeSize / TIKTOK_DEFAULT_CHUNK_BYTES),
  };
}
