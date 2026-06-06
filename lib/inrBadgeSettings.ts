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
  | "youtubeShorts"
  | "appointment"
  | "quote";

export type InrBadgeShareSettings = Record<InrBadgeShareKey, boolean>;

export type InrBadgeAppointmentDaySettings = {
  enabled: boolean;
  startTime: string;
  endTime: string;
  durationMinutes: number;
};

export type InrBadgeAppointmentSettings = {
  durationMinutes: number;
  daysAhead: number;
  minNoticeHours: number;
  startTime: string;
  endTime: string;
  weekdays: number[];
  dailySlots: Record<string, InrBadgeAppointmentDaySettings>;
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
  youtubeShorts: true,
  appointment: true,
  quote: false,
};

export const DEFAULT_INRBADGE_DAY_SETTINGS: InrBadgeAppointmentDaySettings = {
  enabled: true,
  startTime: "09:00",
  endTime: "18:00",
  durationMinutes: 30,
};

const DEFAULT_INRBADGE_DAILY_SLOTS: Record<string, InrBadgeAppointmentDaySettings> = {
  "0": { ...DEFAULT_INRBADGE_DAY_SETTINGS, enabled: false },
  "1": { ...DEFAULT_INRBADGE_DAY_SETTINGS, enabled: true },
  "2": { ...DEFAULT_INRBADGE_DAY_SETTINGS, enabled: true },
  "3": { ...DEFAULT_INRBADGE_DAY_SETTINGS, enabled: true },
  "4": { ...DEFAULT_INRBADGE_DAY_SETTINGS, enabled: true },
  "5": { ...DEFAULT_INRBADGE_DAY_SETTINGS, enabled: true },
  "6": { ...DEFAULT_INRBADGE_DAY_SETTINGS, enabled: false },
};

export const DEFAULT_INRBADGE_APPOINTMENT_SETTINGS: InrBadgeAppointmentSettings = {
  durationMinutes: 30,
  daysAhead: 14,
  minNoticeHours: 4,
  startTime: "09:00",
  endTime: "18:00",
  weekdays: [1, 2, 3, 4, 5],
  dailySlots: DEFAULT_INRBADGE_DAILY_SLOTS,
};

const SHARE_KEYS = Object.keys(DEFAULT_INRBADGE_SHARE_SETTINGS) as InrBadgeShareKey[];
const WEEKDAY_KEYS = ["0", "1", "2", "3", "4", "5", "6"] as const;

function asPlainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numberValue)));
}

function parseTimeToMinutes(value: string) {
  const [rawHour, rawMinute] = value.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function normalizeTime(value: unknown, fallback: string) {
  const raw = String(value || "").trim();
  if (/^\d{2}:\d{2}$/.test(raw) && parseTimeToMinutes(raw) !== null) return raw;
  return fallback;
}

function normalizeWeekdays(value: unknown, fallback: number[]) {
  const rawWeekdays = Array.isArray(value) ? value : fallback;
  const weekdays = rawWeekdays
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .sort((a, b) => a - b);
  return weekdays.length ? weekdays : fallback;
}

function normalizeDaySettings(value: unknown, fallback: InrBadgeAppointmentDaySettings): InrBadgeAppointmentDaySettings {
  const raw = asPlainObject(value);
  let startTime = normalizeTime(raw.startTime, fallback.startTime);
  let endTime = normalizeTime(raw.endTime, fallback.endTime);
  const durationMinutes = clampNumber(raw.durationMinutes, fallback.durationMinutes, 15, 180);
  const startMinutes = parseTimeToMinutes(startTime) ?? parseTimeToMinutes(fallback.startTime) ?? 540;
  const endMinutes = parseTimeToMinutes(endTime) ?? parseTimeToMinutes(fallback.endTime) ?? 1080;

  if (endMinutes <= startMinutes) {
    startTime = fallback.startTime;
    endTime = fallback.endTime;
  }

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
    startTime,
    endTime,
    durationMinutes,
  };
}

function buildDailySlotsFromLegacy(raw: Record<string, unknown>, defaultSettings: InrBadgeAppointmentSettings) {
  const legacyDuration = clampNumber(raw.durationMinutes, defaultSettings.durationMinutes, 15, 180);
  let legacyStartTime = normalizeTime(raw.startTime, defaultSettings.startTime);
  let legacyEndTime = normalizeTime(raw.endTime, defaultSettings.endTime);
  const startMinutes = parseTimeToMinutes(legacyStartTime) ?? 540;
  const endMinutes = parseTimeToMinutes(legacyEndTime) ?? 1080;
  if (endMinutes <= startMinutes) {
    legacyStartTime = defaultSettings.startTime;
    legacyEndTime = defaultSettings.endTime;
  }
  const legacyWeekdays = normalizeWeekdays(raw.weekdays, defaultSettings.weekdays);

  return WEEKDAY_KEYS.reduce((acc, key) => {
    const day = Number(key);
    acc[key] = {
      enabled: legacyWeekdays.includes(day),
      startTime: legacyStartTime,
      endTime: legacyEndTime,
      durationMinutes: legacyDuration,
    };
    return acc;
  }, {} as Record<string, InrBadgeAppointmentDaySettings>);
}

function getFirstEnabledDay(dailySlots: Record<string, InrBadgeAppointmentDaySettings>) {
  return WEEKDAY_KEYS.map((key) => dailySlots[key]).find((day) => day?.enabled) || dailySlots["1"] || DEFAULT_INRBADGE_DAY_SETTINGS;
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
  const daysAhead = clampNumber(raw.daysAhead, defaultSettings.daysAhead, 1, 60);
  const minNoticeHours = clampNumber(raw.minNoticeHours, defaultSettings.minNoticeHours, 0, 168);
  const rawDailySlots = asPlainObject(raw.dailySlots);
  const hasDailySlots = WEEKDAY_KEYS.some((key) => Object.prototype.hasOwnProperty.call(rawDailySlots, key));
  const legacyDailySlots = buildDailySlotsFromLegacy(raw, defaultSettings);

  const dailySlots = WEEKDAY_KEYS.reduce((acc, key) => {
    const fallback = hasDailySlots ? DEFAULT_INRBADGE_DAILY_SLOTS[key] : legacyDailySlots[key];
    acc[key] = normalizeDaySettings(hasDailySlots ? rawDailySlots[key] : legacyDailySlots[key], fallback);
    return acc;
  }, {} as Record<string, InrBadgeAppointmentDaySettings>);

  const weekdays = WEEKDAY_KEYS.map(Number).filter((day) => dailySlots[String(day)]?.enabled);
  const firstEnabledDay = getFirstEnabledDay(dailySlots);

  return {
    durationMinutes: firstEnabledDay.durationMinutes,
    daysAhead,
    minNoticeHours,
    startTime: firstEnabledDay.startTime,
    endTime: firstEnabledDay.endTime,
    weekdays: weekdays.length ? weekdays : defaultSettings.weekdays,
    dailySlots,
  };
}

export function resolveInrBadgeAppointmentSettings(rootSettings: unknown): InrBadgeAppointmentSettings {
  const root = asPlainObject(rootSettings);
  const inrcalendar = asPlainObject(root.inrcalendar);
  const calendarAppointmentSettings = Object.prototype.hasOwnProperty.call(inrcalendar, "appointment_settings")
    ? inrcalendar.appointment_settings
    : undefined;
  return normalizeInrBadgeAppointmentSettings(calendarAppointmentSettings ?? root.inrBadgeAppointmentSettings);
}

export function sanitizeInrBadgeShareSettingsPayload(value: unknown): InrBadgeShareSettings {
  return normalizeInrBadgeShareSettings(value);
}

export function sanitizeInrBadgeAppointmentSettingsPayload(value: unknown): InrBadgeAppointmentSettings {
  return normalizeInrBadgeAppointmentSettings(value);
}
