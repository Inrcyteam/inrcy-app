export type TiktokPreferredMedia = "video" | "photos";
export type TiktokCommercialContent = "none" | "self" | "branded";

export type TiktokDefaultSettings = {
  preferredMedia: TiktokPreferredMedia;
  allowComments: boolean;
  allowDuo: boolean;
  allowStitch: boolean;
  photoAutoMusic: boolean;
  commercialContent: TiktokCommercialContent;
  aiContent: boolean;
};

export type TiktokMockSettings = {
  connected: boolean;
  accountConnected: boolean;
  username: string;
  displayName: string;
  profileUrl: string;
  avatarUrl: string;
  openId: string;
  scopes: string;
  expiresAt: string | null;
  mode: "mock" | "oauth";
  defaults: TiktokDefaultSettings;
  stats: {
    followerCount: number | null;
    followingCount: number | null;
    likesCount: number | null;
    videoCount: number | null;
  };
  updatedAt: string | null;
};

export const TIKTOK_DEFAULT_SETTINGS: TiktokDefaultSettings = {
  preferredMedia: "video",
  allowComments: true,
  allowDuo: true,
  allowStitch: true,
  photoAutoMusic: true,
  commercialContent: "none",
  aiContent: false,
};

export const TIKTOK_DEFAULT_MOCK_ACCOUNT = {
  username: "@demo_inrcy",
  profileUrl: "https://www.tiktok.com/@demo_inrcy",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeTiktokPreferredMedia(value: unknown): TiktokPreferredMedia {
  return value === "photos" ? "photos" : "video";
}

export function normalizeTiktokCommercialContent(value: unknown): TiktokCommercialContent {
  if (value === "self" || value === "branded") return value;
  return "none";
}

export function normalizeTiktokDefaults(value: unknown): TiktokDefaultSettings {
  const raw = asRecord(value);
  return {
    preferredMedia: normalizeTiktokPreferredMedia(raw.preferredMedia),
    allowComments: asBoolean(raw.allowComments, TIKTOK_DEFAULT_SETTINGS.allowComments),
    allowDuo: asBoolean(raw.allowDuo, TIKTOK_DEFAULT_SETTINGS.allowDuo),
    allowStitch: asBoolean(raw.allowStitch, TIKTOK_DEFAULT_SETTINGS.allowStitch),
    photoAutoMusic: asBoolean(raw.photoAutoMusic, TIKTOK_DEFAULT_SETTINGS.photoAutoMusic),
    commercialContent: normalizeTiktokCommercialContent(raw.commercialContent),
    aiContent: asBoolean(raw.aiContent, TIKTOK_DEFAULT_SETTINGS.aiContent),
  };
}

export function normalizeTiktokSettings(value: unknown): TiktokMockSettings {
  const raw = asRecord(value);
  const defaults = normalizeTiktokDefaults(raw.defaults);
  const connected = asBoolean(raw.connected, false);
  const accountConnected = asBoolean(raw.accountConnected, connected);
  const stats = asRecord(raw.stats);
  return {
    connected,
    accountConnected,
    username: asString(raw.username) || TIKTOK_DEFAULT_MOCK_ACCOUNT.username,
    displayName: asString(raw.displayName),
    profileUrl: asString(raw.profileUrl),
    avatarUrl: asString(raw.avatarUrl),
    openId: asString(raw.openId),
    scopes: asString(raw.scopes),
    expiresAt: asString(raw.expiresAt) || null,
    mode: raw.mode === "oauth" ? "oauth" : "mock",
    defaults,
    stats: {
      followerCount: asNumber(stats.followerCount),
      followingCount: asNumber(stats.followingCount),
      likesCount: asNumber(stats.likesCount),
      videoCount: asNumber(stats.videoCount),
    },
    updatedAt: asString(raw.updatedAt) || null,
  };
}

export function normalizeTiktokProfileUrl(input: unknown): { ok: true; url: string } | { ok: false; error: string } {
  const value = asString(input).trim();
  if (!value) return { ok: false, error: "Renseigne le lien public du compte TikTok." };
  const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  if (!/tiktok\.com/i.test(normalized)) return { ok: false, error: "Le lien doit pointer vers un compte TikTok." };
  return { ok: true, url: normalized };
}

export function buildTiktokSettingsPatch(current: unknown, patch: Partial<TiktokMockSettings>): TiktokMockSettings {
  const base = normalizeTiktokSettings(current);
  return {
    ...base,
    ...patch,
    defaults: normalizeTiktokDefaults({ ...base.defaults, ...(patch.defaults ?? {}) }),
    updatedAt: new Date().toISOString(),
  };
}
