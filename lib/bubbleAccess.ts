export const APP_BUBBLE_KEYS = [
  "inrbadge",
  "mails",
  "site_inrcy",
  "site_web",
  "gmb",
  "inr_search",
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube_shorts",
  "pinterest",
  "inr_agent",
  "inr_calendar",
  "inr_crm",
  "inr_send",
  "inr_stats",
  "documents",
] as const;

export type AppBubbleKey = (typeof APP_BUBBLE_KEYS)[number];
export type AppBubbleAccessMap = Record<AppBubbleKey, boolean>;

export type AppBubbleAccessRow = {
  bubble_key: string | null;
  enabled: boolean | null;
};

export type AppBubbleAccessInsertRow = {
  user_id: string;
  bubble_key: AppBubbleKey;
  enabled: boolean;
};

export const APP_BUBBLE_DEFAULT_ACCESS: AppBubbleAccessMap = {
  inrbadge: true,
  mails: true,
  site_inrcy: true,
  site_web: true,
  gmb: true,
  inr_search: true,
  facebook: true,
  instagram: true,
  linkedin: true,
  tiktok: false,
  youtube_shorts: true,
  pinterest: false,
  inr_agent: true,
  inr_calendar: true,
  inr_crm: true,
  inr_send: true,
  inr_stats: true,
  documents: true,
};

const APP_BUBBLE_KEY_SET = new Set<string>(APP_BUBBLE_KEYS);

export function isAppBubbleKey(value: unknown): value is AppBubbleKey {
  return typeof value === "string" && APP_BUBBLE_KEY_SET.has(value);
}

export function normalizeAppBubbleKey(value: unknown): AppBubbleKey | null {
  if (isAppBubbleKey(value)) return value;
  return null;
}

export function createDefaultBubbleAccessMap(): AppBubbleAccessMap {
  return { ...APP_BUBBLE_DEFAULT_ACCESS };
}


export function createDefaultBubbleAccessRows(userId: string): AppBubbleAccessInsertRow[] {
  return APP_BUBBLE_KEYS.map((bubbleKey) => ({
    user_id: userId,
    bubble_key: bubbleKey,
    enabled: APP_BUBBLE_DEFAULT_ACCESS[bubbleKey],
  }));
}

export function buildBubbleAccessMap(rows?: AppBubbleAccessRow[] | null): AppBubbleAccessMap {
  const accessMap = createDefaultBubbleAccessMap();

  for (const row of rows ?? []) {
    const bubbleKey = normalizeAppBubbleKey(row?.bubble_key);
    if (!bubbleKey) continue;
    accessMap[bubbleKey] = Boolean(row.enabled);
  }

  return accessMap;
}

export function isBubbleEnabled(
  accessMap: Partial<Record<AppBubbleKey, boolean>> | null | undefined,
  bubbleKey: AppBubbleKey,
): boolean {
  return accessMap?.[bubbleKey] ?? APP_BUBBLE_DEFAULT_ACCESS[bubbleKey];
}
