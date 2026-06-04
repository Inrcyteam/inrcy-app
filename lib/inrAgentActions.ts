export const INR_AGENT_ACTION_TYPES = ["publication", "mailing", "review_request", "loyalty", "custom"] as const;
export const INR_AGENT_TARGET_TOOLS = ["booster", "mails", "propulser", "fideliser", "agent"] as const;
export const INR_AGENT_ACTION_STATUSES = ["pending", "draft", "scheduled", "validated", "refused", "completed"] as const;

export type InrAgentActionType = (typeof INR_AGENT_ACTION_TYPES)[number];
export type InrAgentTargetTool = (typeof INR_AGENT_TARGET_TOOLS)[number];
export type InrAgentActionStatus = (typeof INR_AGENT_ACTION_STATUSES)[number];

export type InrAgentAction = {
  id: string;
  actionType: InrAgentActionType;
  targetTool: InrAgentTargetTool;
  title: string;
  summary: string;
  previewText: string;
  targetChannels: string[];
  status: InrAgentActionStatus;
  scheduledFor: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type InrAgentActionStats = {
  pending: number;
  scheduled: number;
  validated: number;
  refused: number;
};

export const INR_AGENT_ACTION_LABELS = {
  publication: "Publication multicanale",
  mailing: "Campagne mailing",
  review_request: "Demande d'avis",
  loyalty: "Fidélisation",
  custom: "Action iNr'Agent",
} satisfies Record<InrAgentActionType, string>;

export const INR_AGENT_TOOL_LABELS = {
  booster: "Booster",
  mails: "Mails",
  propulser: "Propulser",
  fideliser: "Fidéliser",
  agent: "iNr'Agent",
} satisfies Record<InrAgentTargetTool, string>;

export const INR_AGENT_STATUS_LABELS = {
  pending: "À valider",
  draft: "Brouillon",
  scheduled: "Programmée",
  validated: "Validée",
  refused: "Refusée",
  completed: "Terminée",
} satisfies Record<InrAgentActionStatus, string>;

export const INR_AGENT_ACTION_ICONS = {
  publication: "📢",
  mailing: "📧",
  review_request: "⭐",
  loyalty: "💎",
  custom: "✦",
} satisfies Record<InrAgentActionType, string>;

type DbInrAgentActionRow = {
  id?: string | null;
  action_type?: string | null;
  target_tool?: string | null;
  title?: string | null;
  summary?: string | null;
  preview_text?: string | null;
  target_channels?: string[] | null;
  status?: string | null;
  scheduled_for?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function includesValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function sanitizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}

export function rowToInrAgentAction(row: DbInrAgentActionRow): InrAgentAction {
  const actionType = includesValue(INR_AGENT_ACTION_TYPES, row.action_type) ? row.action_type : "custom";
  const targetTool = includesValue(INR_AGENT_TARGET_TOOLS, row.target_tool) ? row.target_tool : "agent";
  const status = includesValue(INR_AGENT_ACTION_STATUSES, row.status) ? row.status : "pending";
  const fallbackTitle = INR_AGENT_ACTION_LABELS[actionType];

  return {
    id: String(row.id || ""),
    actionType,
    targetTool,
    title: String(row.title || fallbackTitle),
    summary: String(row.summary || "Action préparée par iNr'Agent."),
    previewText: String(row.preview_text || ""),
    targetChannels: sanitizeStringArray(row.target_channels),
    status,
    scheduledFor: row.scheduled_for || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function summarizeInrAgentActions(actions: InrAgentAction[]): InrAgentActionStats {
  return actions.reduce<InrAgentActionStats>((stats, action) => {
    if (action.status === "pending" || action.status === "draft") stats.pending += 1;
    if (action.status === "scheduled") stats.scheduled += 1;
    if (action.status === "validated" || action.status === "completed") stats.validated += 1;
    if (action.status === "refused") stats.refused += 1;
    return stats;
  }, { pending: 0, scheduled: 0, validated: 0, refused: 0 });
}

export function sanitizeInrAgentActionStatus(input: unknown): InrAgentActionStatus | null {
  return includesValue(INR_AGENT_ACTION_STATUSES, input) ? input : null;
}
