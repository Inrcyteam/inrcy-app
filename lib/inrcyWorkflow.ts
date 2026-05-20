/**
 * Taxonomie métier iNrCy — base commune de la refonte Booster / Propulser / Fidéliser.
 *
 * Objectif de l'étape 1 : centraliser les mots, les familles et les correspondances
 * sans casser l'existant. Les anciennes valeurs techniques restent reconnues pour
 * préserver l'historique iNr'Send, les campagnes déjà envoyées et les deep-links.
 */

export const INRCY_WORKFLOW_VERSION = "2026-05-booster-propulser-fideliser" as const;

export type InrcyWorkflowTool = "booster" | "propulser" | "fideliser";
export type InrcyWorkflowAction =
  | "publier"
  | "valoriser"
  | "recolter"
  | "offrir"
  | "informer"
  | "suivre"
  | "enqueter";

export type InrcyLegacyHistoryFolder =
  | "mails"
  | "factures"
  | "devis"
  | "publications"
  | "recoltes"
  | "offres"
  | "informations"
  | "suivis"
  | "enquetes";

export type InrcyGroupedHistoryFolder =
  | "mails"
  | "factures"
  | "devis"
  | "publications"
  | "propulsions"
  | "fidelisations";

export type InrcyTrackKind = "booster" | "propulser" | "fideliser";
export type InrcyTrackType =
  | "publish"
  | "valorize"
  | "review_mail"
  | "promo_mail"
  | "newsletter_mail"
  | "thanks_mail"
  | "satisfaction_mail";

type InrcyToolDefinition = {
  key: InrcyWorkflowTool;
  label: string;
  path: string;
  shortPurpose: string;
  dashboardSubtitle: string;
  primaryCta: string;
};

type InrcyActionDefinition = {
  key: InrcyWorkflowAction;
  label: string;
  tool: InrcyWorkflowTool;
  legacyFolder?: InrcyLegacyHistoryFolder;
  groupedFolder: InrcyGroupedHistoryFolder;
  trackKind: InrcyTrackKind;
  trackType: InrcyTrackType;
  purpose: string;
};

export const INRCY_WORKFLOW_TOOLS = {
  booster: {
    key: "booster",
    label: "Booster",
    path: "/dashboard/booster",
    shortPurpose: "Visibilité immédiate",
    dashboardSubtitle: "Active vos canaux",
    primaryCta: "Publier maintenant",
  },
  propulser: {
    key: "propulser",
    label: "Propulser",
    path: "/dashboard/propulser",
    shortPurpose: "Développement commercial",
    dashboardSubtitle: "Accélère votre activité",
    primaryCta: "Développer",
  },
  fideliser: {
    key: "fideliser",
    label: "Fidéliser",
    path: "/dashboard/fideliser",
    shortPurpose: "Relation client",
    dashboardSubtitle: "Pérennise l’activité",
    primaryCta: "Communiquer",
  },
} as const satisfies Record<InrcyWorkflowTool, InrcyToolDefinition>;

export const INRCY_WORKFLOW_ACTIONS = {
  publier: {
    key: "publier",
    label: "Publier",
    tool: "booster",
    legacyFolder: "publications",
    groupedFolder: "publications",
    trackKind: "booster",
    trackType: "publish",
    purpose: "Diffuser un contenu sur les canaux connectés.",
  },
  valoriser: {
    key: "valoriser",
    label: "Valoriser",
    tool: "propulser",
    groupedFolder: "propulsions",
    trackKind: "propulser",
    trackType: "valorize",
    purpose: "Mettre en avant le savoir-faire, les avis, les réalisations ou les coulisses.",
  },
  recolter: {
    key: "recolter",
    label: "Récolter",
    tool: "propulser",
    legacyFolder: "recoltes",
    groupedFolder: "propulsions",
    trackKind: "propulser",
    trackType: "review_mail",
    purpose: "Obtenir des avis, contacts, demandes ou retours exploitables.",
  },
  offrir: {
    key: "offrir",
    label: "Offrir",
    tool: "propulser",
    legacyFolder: "offres",
    groupedFolder: "propulsions",
    trackKind: "propulser",
    trackType: "promo_mail",
    purpose: "Mettre en avant une offre, une promotion ou une opportunité commerciale.",
  },
  informer: {
    key: "informer",
    label: "Informer",
    tool: "fideliser",
    legacyFolder: "informations",
    groupedFolder: "fidelisations",
    trackKind: "fideliser",
    trackType: "newsletter_mail",
    purpose: "Informer les contacts et garder une présence régulière.",
  },
  suivre: {
    key: "suivre",
    label: "Suivre",
    tool: "fideliser",
    legacyFolder: "suivis",
    groupedFolder: "fidelisations",
    trackKind: "fideliser",
    trackType: "thanks_mail",
    purpose: "Relancer, remercier ou garder le lien après une interaction.",
  },
  enqueter: {
    key: "enqueter",
    label: "Enquêter",
    tool: "fideliser",
    legacyFolder: "enquetes",
    groupedFolder: "fidelisations",
    trackKind: "fideliser",
    trackType: "satisfaction_mail",
    purpose: "Mesurer la satisfaction ou recueillir des besoins.",
  },
} as const satisfies Record<InrcyWorkflowAction, InrcyActionDefinition>;

export const BOOSTER_ACTIONS = ["publier"] as const satisfies readonly InrcyWorkflowAction[];
export const PROPULSER_ACTIONS = ["valoriser", "recolter", "offrir"] as const satisfies readonly InrcyWorkflowAction[];
export const FIDELISER_ACTIONS = ["informer", "suivre", "enqueter"] as const satisfies readonly InrcyWorkflowAction[];

export const INRSEND_GROUPED_FOLDERS = [
  "mails",
  "factures",
  "devis",
  "publications",
  "propulsions",
  "fidelisations",
] as const satisfies readonly InrcyGroupedHistoryFolder[];

export const INRSEND_LEGACY_FOLDERS = [
  "mails",
  "factures",
  "devis",
  "publications",
  "recoltes",
  "offres",
  "informations",
  "suivis",
  "enquetes",
] as const satisfies readonly InrcyLegacyHistoryFolder[];

export const WEEKLY_WORKFLOW_GOALS = {
  booster: {
    tool: "booster",
    label: "Publier au moins 1 fois",
    target: 1,
    actions: BOOSTER_ACTIONS,
  },
  propulser: {
    tool: "propulser",
    label: "Lancer 1 action Propulser",
    target: 1,
    actions: PROPULSER_ACTIONS,
  },
  fideliser: {
    tool: "fideliser",
    label: "Lancer 1 action Fidéliser",
    target: 1,
    actions: FIDELISER_ACTIONS,
  },
} as const;

export function isLegacyHistoryFolder(value: string | null | undefined): value is InrcyLegacyHistoryFolder {
  return Boolean(value && (INRSEND_LEGACY_FOLDERS as readonly string[]).includes(value));
}

export function isGroupedHistoryFolder(value: string | null | undefined): value is InrcyGroupedHistoryFolder {
  return Boolean(value && (INRSEND_GROUPED_FOLDERS as readonly string[]).includes(value));
}

export function getGroupedHistoryFolder(folder: string | null | undefined): InrcyGroupedHistoryFolder | null {
  if (!folder) return null;
  if (isGroupedHistoryFolder(folder)) return folder;
  if (folder === "recoltes" || folder === "offres") return "propulsions";
  if (folder === "informations" || folder === "suivis" || folder === "enquetes") return "fidelisations";
  return null;
}

export function getActionFromLegacyFolder(folder: string | null | undefined): InrcyWorkflowAction | null {
  if (folder === "publications") return "publier";
  if (folder === "recoltes") return "recolter";
  if (folder === "offres") return "offrir";
  if (folder === "informations") return "informer";
  if (folder === "suivis") return "suivre";
  if (folder === "enquetes") return "enqueter";
  return null;
}

export function getActionFromTrack(trackKind: string | null | undefined, trackType: string | null | undefined): InrcyWorkflowAction | null {
  const kind = String(trackKind || "").toLowerCase();
  const type = String(trackType || "").toLowerCase();

  if (kind === "booster" && type === "publish") return "publier";
  if ((kind === "propulser" || kind === "booster") && type === "valorize") return "valoriser";
  if ((kind === "propulser" || kind === "booster") && type === "review_mail") return "recolter";
  if ((kind === "propulser" || kind === "booster") && type === "promo_mail") return "offrir";
  if (kind === "fideliser" && type === "newsletter_mail") return "informer";
  if (kind === "fideliser" && type === "thanks_mail") return "suivre";
  if (kind === "fideliser" && type === "satisfaction_mail") return "enqueter";

  return null;
}

export function getWorkflowToolForAction(action: InrcyWorkflowAction): InrcyWorkflowTool {
  return INRCY_WORKFLOW_ACTIONS[action].tool;
}

export function getWorkflowToolForFolder(folder: string | null | undefined): InrcyWorkflowTool | null {
  const action = getActionFromLegacyFolder(folder);
  if (action) return getWorkflowToolForAction(action);
  if (folder === "publications") return "booster";
  if (folder === "propulsions") return "propulser";
  if (folder === "fidelisations") return "fideliser";
  return null;
}

export function getWorkflowActionLabel(action: InrcyWorkflowAction | null | undefined): string {
  return action ? INRCY_WORKFLOW_ACTIONS[action].label : "Action";
}

export function getWorkflowToolLabel(tool: InrcyWorkflowTool | null | undefined): string {
  return tool ? INRCY_WORKFLOW_TOOLS[tool].label : "Outil";
}
