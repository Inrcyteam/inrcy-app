export const INR_AGENT_FREQUENCIES = ["weekly", "biweekly", "monthly"] as const;
export const INR_AGENT_MODES = ["draft_only", "validation_required", "automatic"] as const;
export const INR_AGENT_GOALS = ["visibility", "acquisition", "loyalty", "reviews"] as const;
export const INR_AGENT_TONES = ["professional", "friendly", "premium", "local", "dynamic"] as const;
export const INR_AGENT_ACTIONS = ["publication", "mailing", "review_request", "loyalty"] as const;
export const INR_AGENT_CHANNELS = ["site_inrcy", "site_web", "gmb", "facebook", "instagram", "linkedin", "tiktok", "mails"] as const;

export type InrAgentFrequency = (typeof INR_AGENT_FREQUENCIES)[number];
export type InrAgentMode = (typeof INR_AGENT_MODES)[number];
export type InrAgentGoal = (typeof INR_AGENT_GOALS)[number];
export type InrAgentTone = (typeof INR_AGENT_TONES)[number];
export type InrAgentAction = (typeof INR_AGENT_ACTIONS)[number];
export type InrAgentChannel = (typeof INR_AGENT_CHANNELS)[number];

export type InrAgentSettings = {
  enabled: boolean;
  frequency: InrAgentFrequency;
  dayOfWeek: number;
  time: string;
  mode: InrAgentMode;
  goal: InrAgentGoal;
  tone: InrAgentTone;
  allowedActions: InrAgentAction[];
  allowedChannels: InrAgentChannel[];
  useMediaLibrary: boolean;
  allowAiImages: boolean;
};

export const INR_AGENT_DEFAULT_SETTINGS: InrAgentSettings = {
  enabled: false,
  frequency: "weekly",
  dayOfWeek: 1,
  time: "09:00",
  mode: "validation_required",
  goal: "visibility",
  tone: "professional",
  allowedActions: ["publication", "mailing", "review_request", "loyalty"],
  allowedChannels: ["site_inrcy", "site_web", "gmb", "facebook", "instagram", "linkedin", "mails"],
  useMediaLibrary: true,
  allowAiImages: false,
};

export const INR_AGENT_LABELS = {
  frequencies: {
    weekly: "1 fois / semaine",
    biweekly: "2 fois / mois",
    monthly: "1 fois / mois",
  } satisfies Record<InrAgentFrequency, string>,
  modes: {
    draft_only: "Brouillon uniquement",
    validation_required: "Validation obligatoire",
    automatic: "Automatique",
  } satisfies Record<InrAgentMode, string>,
  goals: {
    visibility: "Visibilité",
    acquisition: "Acquisition",
    loyalty: "Fidélisation",
    reviews: "Avis clients",
  } satisfies Record<InrAgentGoal, string>,
  tones: {
    professional: "Professionnel",
    friendly: "Accessible",
    premium: "Premium",
    local: "Local",
    dynamic: "Dynamique",
  } satisfies Record<InrAgentTone, string>,
  actions: {
    publication: "Publications",
    mailing: "Campagnes mails",
    review_request: "Demandes d'avis",
    loyalty: "Fidélisation",
  } satisfies Record<InrAgentAction, string>,
  channels: {
    site_inrcy: "Site iNrCy",
    site_web: "Site Web",
    gmb: "Google Business",
    facebook: "Facebook",
    instagram: "Instagram",
    linkedin: "LinkedIn",
    tiktok: "TikTok",
    mails: "Mails",
  } satisfies Record<InrAgentChannel, string>,
};

export const INR_AGENT_DAYS = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 0, label: "Dimanche" },
] as const;

function includesValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function sanitizeStringArray<T extends readonly string[]>(values: T, input: unknown, fallback: T[number][]): T[number][] {
  if (!Array.isArray(input)) return fallback;
  const sanitized = input.filter((value): value is T[number] => includesValue(values, value));
  return sanitized.length > 0 ? Array.from(new Set(sanitized)) : fallback;
}

function sanitizeTime(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}

function sanitizeDay(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.round(numeric);
  return rounded >= 0 && rounded <= 6 ? rounded : fallback;
}

export function sanitizeInrAgentSettings(input: Partial<InrAgentSettings> | null | undefined): InrAgentSettings {
  const defaults = INR_AGENT_DEFAULT_SETTINGS;
  const source = input ?? {};

  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : defaults.enabled,
    frequency: includesValue(INR_AGENT_FREQUENCIES, source.frequency) ? source.frequency : defaults.frequency,
    dayOfWeek: sanitizeDay(source.dayOfWeek, defaults.dayOfWeek),
    time: sanitizeTime(source.time, defaults.time),
    mode: includesValue(INR_AGENT_MODES, source.mode) ? source.mode : defaults.mode,
    goal: includesValue(INR_AGENT_GOALS, source.goal) ? source.goal : defaults.goal,
    tone: includesValue(INR_AGENT_TONES, source.tone) ? source.tone : defaults.tone,
    allowedActions: sanitizeStringArray(INR_AGENT_ACTIONS, source.allowedActions, defaults.allowedActions),
    allowedChannels: sanitizeStringArray(INR_AGENT_CHANNELS, source.allowedChannels, defaults.allowedChannels),
    useMediaLibrary: typeof source.useMediaLibrary === "boolean" ? source.useMediaLibrary : defaults.useMediaLibrary,
    allowAiImages: typeof source.allowAiImages === "boolean" ? source.allowAiImages : defaults.allowAiImages,
  };
}
