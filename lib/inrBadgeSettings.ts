export type InrBadgeShareKey =
  | "logo"
  | "name"
  | "company"
  | "phone"
  | "email"
  | "saveContact"
  | "siteInrcy"
  | "siteWeb"
  | "googleBusiness"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "mails"
  | "tiktok"
  | "appointment"
  | "quote";

export type InrBadgeShareSettings = Record<InrBadgeShareKey, boolean>;

export const DEFAULT_INRBADGE_SHARE_SETTINGS: InrBadgeShareSettings = {
  logo: true,
  name: true,
  company: true,
  phone: true,
  email: true,
  saveContact: true,
  siteInrcy: true,
  siteWeb: true,
  googleBusiness: true,
  facebook: true,
  instagram: true,
  linkedin: true,
  mails: true,
  tiktok: false,
  appointment: true,
  quote: true,
};

const SHARE_KEYS = Object.keys(DEFAULT_INRBADGE_SHARE_SETTINGS) as InrBadgeShareKey[];

function asPlainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function normalizeInrBadgeShareSettings(value: unknown): InrBadgeShareSettings {
  const raw = asPlainObject(value);
  return SHARE_KEYS.reduce((acc, key) => {
    acc[key] = typeof raw[key] === "boolean" ? raw[key] : DEFAULT_INRBADGE_SHARE_SETTINGS[key];
    return acc;
  }, { ...DEFAULT_INRBADGE_SHARE_SETTINGS } as InrBadgeShareSettings);
}

export function sanitizeInrBadgeShareSettingsPayload(value: unknown): InrBadgeShareSettings {
  return normalizeInrBadgeShareSettings(value);
}
