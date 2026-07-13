export const INR_SEARCH_CONTENT_MAX_LENGTH = 300;

export function limitBoosterChannelContent(channel: string, content: string) {
  const normalized = String(content || "").trim();
  return channel === "inr_search"
    ? normalized.slice(0, INR_SEARCH_CONTENT_MAX_LENGTH).trim()
    : normalized;
}
