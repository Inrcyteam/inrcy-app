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

export type InrBadgeAppointmentSettings = {
  durationMinutes: number;
  daysAhead: number;
  minNoticeHours: number;
  startTime: string;
  endTime: string;
  weekdays: number[];
};

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
  quote: false,
};

export const DEFAULT_INRBADGE_APPOINTMENT_SETTINGS: InrBadgeAppointmentSettings = {
  durationMinutes: 30,
  daysAhead: 14,
  minNoticeHours: 4,
  startTime: "09:00",
  endTime: "18:00",
  weekdays: [1, 2, 3, 4, 5],
};

const SHARE_KEYS = Object.keys(DEFAULT_INRBADGE_SHARE_SETTINGS) as InrBadgeShareKey[];

function asPlainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numberValue)));
}

function normalizeTime(value: unknown, fallback: string) {
  const raw = String(value || "").trim();
  if (/^\d{2}:\d{2}$/.test(raw)) return raw;
  return fallback;
}

export function normalizeInrBadgeShareSettings(value: unknown): InrBadgeShareSettings {
  const raw = asPlainObject(value);
  return SHARE_KEYS.reduce((acc, key) => {
    acc[key] = typeof raw[key] === "boolean" ? raw[key] : DEFAULT_INRBADGE_SHARE_SETTINGS[key];
    return acc;
  }, { ...DEFAULT_INRBADGE_SHARE_SETTINGS } as InrBadgeShareSettings);
}

export function normalizeInrBadgeAppointmentSettings(value: unknown): InrBadgeAppointmentSettings {
  const raw = asPlainObject(value);
  const defaultSettings = DEFAULT_INRBADGE_APPOINTMENT_SETTINGS;
  const rawWeekdays = Array.isArray(raw.weekdays) ? raw.weekdays : defaultSettings.weekdays;
  const weekdays = rawWeekdays
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .sort((a, b) => a - b);

  const durationMinutes = clampNumber(raw.durationMinutes, defaultSettings.durationMinutes, 15, 180);
  const daysAhead = clampNumber(raw.daysAhead, defaultSettings.daysAhead, 1, 60);
  const minNoticeHours = clampNumber(raw.minNoticeHours, defaultSettings.minNoticeHours, 0, 168);
  let startTime = normalizeTime(raw.startTime, defaultSettings.startTime);
  let endTime = normalizeTime(raw.endTime, defaultSettings.endTime);

  if (endTime <= startTime) {
    startTime = defaultSettings.startTime;
    endTime = defaultSettings.endTime;
  }

  return {
    durationMinutes,
    daysAhead,
    minNoticeHours,
    startTime,
    endTime,
    weekdays: weekdays.length ? weekdays : defaultSettings.weekdays,
  };
}

export function sanitizeInrBadgeShareSettingsPayload(value: unknown): InrBadgeShareSettings {
  return normalizeInrBadgeShareSettings(value);
}

export function sanitizeInrBadgeAppointmentSettingsPayload(value: unknown): InrBadgeAppointmentSettings {
  return normalizeInrBadgeAppointmentSettings(value);
}
