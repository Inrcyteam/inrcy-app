export type ActionType =
  | "publier"
  | "offrir"
  | "recolter"
  | "informer"
  | "suivre"
  | "enqueter";

export type ModeType = "booster" | "fideliser";
export type ChannelType = "website" | "social" | "gmb";
export type ChannelKey = "site_inrcy" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";

export type DecisionInput = {
  channelType: ChannelType;
  channelKey?: ChannelKey;
  connected?: boolean;
  opportunities?: number;
  quality?: number;
  metrics?: {
    audience?: number;
    engagement?: number;
    traffic?: number;
    intent?: number;
    conversions?: number;
    visibility?: number;
  };
  provenance?: Array<{
    label: string;
    value: number;
  }>;
};

export type RankedAction = {
  action: ActionType;
  score: number;
};

export type DecisionResult = {
  mode: ModeType;
  action: ActionType;
  reason: string;
  confidence?: number;
  ranking?: RankedAction[];
};

type ScoreCard = Record<ActionType, number>;

type ProvenanceSummary = {
  total: number;
  dominantLabel: string;
  dominantShare: number;
  secondLabel: string;
  secondShare: number;
  googleShare: number;
  directShare: number;
  socialShare: number;
  searchShare: number;
  mapsShare: number;
  audienceShare: number;
  interactionShare: number;
  clickShare: number;
  balanced: boolean;
};

function n(v: unknown) {
  const value = Number(v);
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function norm(value: number, ref: number) {
  if (ref <= 0) return 0;
  return clamp(value / ref);
}

function add(scores: ScoreCard, action: ActionType, points: number) {
  scores[action] += points;
}

function addMany(scores: ScoreCard, actions: ActionType[], points: number) {
  actions.forEach((action) => add(scores, action, points));
}

function buildProvenanceSummary(entries?: DecisionInput["provenance"]): ProvenanceSummary {
  const safeEntries = Array.isArray(entries)
    ? entries
        .map((entry) => ({ label: String(entry?.label || "").trim(), value: Math.max(0, n(entry?.value)) }))
        .filter((entry) => entry.label)
    : [];

  const total = safeEntries.reduce((sum, entry) => sum + entry.value, 0);
  const sorted = [...safeEntries].sort((a, b) => b.value - a.value);
  const dominant = sorted[0] || { label: "", value: 0 };
  const second = sorted[1] || { label: "", value: 0 };

  const share = (matcher: (label: string) => boolean) => {
    if (total <= 0) return 0;
    return clamp(
      safeEntries.filter((entry) => matcher(entry.label.toLowerCase())).reduce((sum, entry) => sum + entry.value, 0) / total,
    );
  };

  const dominantShare = total > 0 ? clamp(dominant.value / total) : 0;
  const secondShare = total > 0 ? clamp(second.value / total) : 0;

  return {
    total,
    dominantLabel: dominant.label,
    dominantShare,
    secondLabel: second.label,
    secondShare,
    googleShare: share((label) => label.includes("google")),
    directShare: share((label) => label.includes("direct")),
    socialShare: share((label) => label.includes("social")),
    searchShare: share((label) => label.includes("search")),
    mapsShare: share((label) => label.includes("maps")),
    audienceShare: share((label) => label.includes("audience") || label.includes("impression")),
    interactionShare: share((label) => label.includes("interaction") || label.includes("engagement")),
    clickShare: share((label) => label.includes("clic")),
    balanced: dominantShare <= 0.65 && secondShare >= 0.2,
  };
}

function emptyScores(): ScoreCard {
  return {
    publier: 0,
    offrir: 0,
    recolter: 0,
    informer: 0,
    suivre: 0,
    enqueter: 0,
  };
}

const ACTION_PRIORITY: Record<ActionType, number> = {
  enqueter: 6,
  suivre: 5,
  offrir: 4,
  recolter: 3,
  informer: 2,
  publier: 1,
};

function sortRanking(scores: ScoreCard): RankedAction[] {
  return (Object.entries(scores) as Array<[ActionType, number]>)
    .map(([action, score]) => ({ action, score: Math.round(clamp(score, 0, 100)) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return ACTION_PRIORITY[b.action] - ACTION_PRIORITY[a.action];
    });
}

function bestAction(scores: ScoreCard): ActionType {
  return sortRanking(scores)[0]?.action || "publier";
}

function normalizeScores(scores: ScoreCard): ScoreCard {
  const values = Object.values(scores);
  const max = Math.max(1, ...values);
  const normalized = emptyScores();
  (Object.keys(scores) as ActionType[]).forEach((action) => {
    normalized[action] = Math.round((scores[action] / max) * 100);
  });
  return normalized;
}

function confidenceFromRanking(ranking: RankedAction[]): number {
  const first = ranking[0]?.score ?? 0;
  const second = ranking[1]?.score ?? 0;
  return Math.round(clamp((first - second) / 35, 0, 1) * 100);
}

function makeReason(action: ActionType, channelType: ChannelType, p: ProvenanceSummary, opp: number, quality: number) {
  const channelLabel = channelType === "website" ? "site" : channelType === "social" ? "réseau" : "fiche locale";
  const dominant = p.dominantLabel ? ` La provenance dominante est « ${p.dominantLabel} ». ` : " ";

  if (action === "publier") {
    return `Le ${channelLabel} manque encore de mouvement visible.${dominant}Les signaux de présence restent trop faibles : il faut relancer la visibilité du canal.`;
  }
  if (action === "offrir") {
    return `Le ${channelLabel} capte déjà de l'attention et le potentiel est réel (${opp} opportunités).${dominant}Le bon levier est maintenant une offre claire, simple et immédiatement activable.`;
  }
  if (action === "recolter") {
    return `Le ${channelLabel} génère de la visibilité mais manque encore de preuves concrètes pour rassurer.${dominant}Il faut récolter avis, retours, cas clients ou preuves sociales.`;
  }
  if (action === "informer") {
    return `Le ${channelLabel} est sain (qualité ${quality}/100) et peut nourrir la relation.${dominant}Informer régulièrement consolidera la confiance avant la prochaine prise de contact.`;
  }
  if (action === "suivre") {
    return `Le ${channelLabel} génère déjà des signaux business exploitables.${dominant}Le bon levier est maintenant le suivi : relance, réponse, remerciement et conversion.`;
  }
  return `Le ${channelLabel} montre des signaux utiles mais encore contradictoires.${dominant}Avant d'accélérer, il faut enquêter pour comprendre ce qui bloque, ce qui manque ou ce qui détourne l'intention.`;
}

function websiteRawScores(input: DecisionInput, p: ProvenanceSummary): ScoreCard {
  const scores = emptyScores();
  const traffic = n(input.metrics?.traffic);
  const engagement = n(input.metrics?.engagement);
  const intent = n(input.metrics?.intent);
  const conversions = n(input.metrics?.conversions);
  const visibility = n(input.metrics?.visibility);
  const opp = n(input.opportunities);
  const quality = n(input.quality);
  const isInrcySite = input.channelKey === "site_inrcy";

  const trafficN = norm(traffic, isInrcySite ? 90 : 120);
  const visibilityN = norm(visibility, 1200);
  const engagementN = norm(engagement, 60);
  const intentN = norm(intent, 8);
  const conversionN = norm(conversions, 10);
  const oppN = norm(opp, 18);
  const qualityN = clamp(quality / 100);

  const hasTraffic = trafficN >= 0.3;
  const hasStrongTraffic = trafficN >= 0.6;
  const hasIntent = intentN >= 0.3;
  const hasConversions = conversions > 0;
  const lowConversions = conversionN < 0.12;
  const highOpp = oppN >= 0.45;
  const strongOpp = oppN >= 0.7;
  const goodQuality = qualityN >= 0.68;
  const mediumQuality = qualityN >= 0.5;
  const lowQuality = qualityN < 0.5;
  const directDominant = p.directShare >= 0.45;
  const searchDriven = p.googleShare + p.searchShare >= 0.4;
  const contradiction =
    (hasTraffic && !hasConversions ? 0.55 : 0) +
    (directDominant && !hasIntent ? 0.25 : 0) +
    (hasStrongTraffic && lowConversions ? 0.35 : 0) +
    (mediumQuality && p.dominantShare >= 0.7 ? 0.2 : 0);

  add(scores, "publier", 1.2);
  add(scores, "offrir", 1.2);
  add(scores, "recolter", 1.0);
  add(scores, "informer", 0.9);
  add(scores, "suivre", 1.0);
  add(scores, "enqueter", 0.9);

  if (!hasTraffic) add(scores, "publier", 3.4);
  if (visibilityN < 0.25) add(scores, "publier", 1.8);
  if (p.socialShare >= 0.25) add(scores, "publier", 0.9);

  if (highOpp) add(scores, "offrir", 2.2);
  if (strongOpp) add(scores, "offrir", 0.9);
  if (hasTraffic) add(scores, "offrir", 1.2);
  if (hasIntent) add(scores, "offrir", 1.7);
  if (lowConversions) add(scores, "offrir", 1.4);
  if (searchDriven) add(scores, "offrir", 0.9);

  if (visibilityN >= 0.35) add(scores, "recolter", 1.4);
  if (searchDriven) add(scores, "recolter", 1.1);
  if (p.socialShare >= 0.2) add(scores, "recolter", 0.7);
  if (lowConversions) add(scores, "recolter", 1.3);
  if (qualityN >= 0.55) add(scores, "recolter", 0.6);

  if (goodQuality) add(scores, "informer", 1.9);
  if (p.balanced) add(scores, "informer", 1.0);
  if (directDominant) add(scores, "informer", 0.9);
  if (engagementN >= 0.45) add(scores, "informer", 0.8);
  if (hasConversions) add(scores, "informer", 0.8);
  if (!strongOpp) add(scores, "informer", 0.4);

  if (hasConversions) add(scores, "suivre", 3.4);
  if (directDominant) add(scores, "suivre", 1.6);
  if (hasIntent) add(scores, "suivre", 1.2);
  if (goodQuality) add(scores, "suivre", 1.0);
  if (engagementN >= 0.45) add(scores, "suivre", 0.6);

  if (contradiction > 0) add(scores, "enqueter", 3.2 * contradiction);
  if (highOpp && lowConversions) add(scores, "enqueter", 1.8);
  if (hasStrongTraffic && !hasConversions) add(scores, "enqueter", 2.0);
  if (!hasIntent && hasTraffic) add(scores, "enqueter", 0.8);
  if (lowQuality) add(scores, "enqueter", 1.5);
  if (!isInrcySite && mediumQuality && highOpp && !hasConversions) add(scores, "enqueter", 1.3);

  if (isInrcySite && goodQuality && directDominant) add(scores, "suivre", 1.0);
  if (isInrcySite && goodQuality) add(scores, "informer", 0.5);
  if (!isInrcySite && mediumQuality && highOpp && !hasConversions) {
    add(scores, "suivre", -1.5);
    add(scores, "offrir", -0.4);
  }

  return scores;
}

function socialRawScores(input: DecisionInput, p: ProvenanceSummary): ScoreCard {
  const scores = emptyScores();
  const audience = n(input.metrics?.audience);
  const engagement = n(input.metrics?.engagement);
  const conversions = n(input.metrics?.conversions);
  const visibility = n(input.metrics?.visibility);
  const opp = n(input.opportunities);
  const quality = n(input.quality);
  const isLinkedIn = input.channelKey === "linkedin";

  const audienceN = norm(audience, isLinkedIn ? 1200 : 4000);
  const engagementN = norm(engagement, isLinkedIn ? 45 : 120);
  const conversionN = norm(conversions, isLinkedIn ? 4 : 12);
  const visibilityN = norm(visibility, isLinkedIn ? 1500 : 4000);
  const oppN = norm(opp, 20);
  const qualityN = clamp(quality / 100);

  const activeAudience = audienceN >= 0.35 || visibilityN >= 0.35;
  const engaged = engagementN >= 0.25;
  const strongEngagement = engagementN >= 0.55;
  const hasConversions = conversions > 0;
  const lowConversions = conversionN < 0.12;
  const highOpp = oppN >= 0.45;
  const goodQuality = qualityN >= 0.62;
  const contradiction =
    (activeAudience && !engaged ? 0.5 : 0) +
    (strongEngagement && !hasConversions ? 0.35 : 0) +
    (p.audienceShare >= 0.75 && p.interactionShare <= 0.1 ? 0.25 : 0);

  addMany(scores, ["publier", "offrir", "recolter", "informer", "suivre", "enqueter"], 0.9);

  if (!activeAudience) add(scores, "publier", 3.1);
  if (!engaged) add(scores, "publier", 1.7);
  if (p.audienceShare >= 0.45) add(scores, "publier", 0.9);
  if (highOpp && !engaged) add(scores, "publier", 0.8);

  if (highOpp) add(scores, "offrir", 2.1);
  if (engaged) add(scores, "offrir", 1.2);
  if (activeAudience) add(scores, "offrir", 1.0);
  if (lowConversions) add(scores, "offrir", 1.5);
  if (p.interactionShare >= 0.35) add(scores, "offrir", 0.8);

  if (activeAudience) add(scores, "recolter", 1.8);
  if (engaged) add(scores, "recolter", 1.4);
  if (lowConversions) add(scores, "recolter", 1.3);
  if (p.audienceShare + p.interactionShare >= 0.55) add(scores, "recolter", 1.0);
  if (goodQuality) add(scores, "recolter", 0.5);

  if (goodQuality) add(scores, "informer", 1.8);
  if (engaged) add(scores, "informer", 1.1);
  if (p.balanced) add(scores, "informer", 0.9);
  if (hasConversions) add(scores, "informer", 0.7);
  if (!highOpp) add(scores, "informer", 0.5);

  if (hasConversions) add(scores, "suivre", 3.4);
  if (strongEngagement) add(scores, "suivre", 1.1);
  if (goodQuality) add(scores, "suivre", 0.9);
  if (p.interactionShare >= 0.35 || p.clickShare >= 0.2) add(scores, "suivre", 0.9);

  if (contradiction > 0) add(scores, "enqueter", 3.0 * contradiction);
  if (activeAudience && !engaged) add(scores, "enqueter", 1.5);
  if (strongEngagement && !hasConversions && highOpp) add(scores, "enqueter", 1.2);
  if (qualityN < 0.45) add(scores, "enqueter", 1.2);

  return scores;
}

function gmbRawScores(input: DecisionInput, p: ProvenanceSummary): ScoreCard {
  const scores = emptyScores();
  const traffic = n(input.metrics?.traffic);
  const conversions = n(input.metrics?.conversions);
  const visibility = n(input.metrics?.visibility);
  const opp = n(input.opportunities);
  const quality = n(input.quality);

  const trafficN = norm(traffic, 35);
  const conversionN = norm(conversions, 35);
  const visibilityN = norm(visibility, 5000);
  const oppN = norm(opp, 35);
  const qualityN = clamp(quality / 100);

  const visible = visibilityN >= 0.25;
  const actionsPresent = conversionN >= 0.18;
  const lowActions = conversionN < 0.1;
  const highOpp = oppN >= 0.35;
  const mapsDriven = p.mapsShare >= 0.35;
  const searchDriven = p.searchShare >= 0.35;
  const contradiction =
    (visible && lowActions ? 0.65 : 0) +
    (mapsDriven && !actionsPresent ? 0.2 : 0) +
    (searchDriven && !actionsPresent ? 0.2 : 0);

  addMany(scores, ["publier", "offrir", "recolter", "informer", "suivre", "enqueter"], 0.8);

  if (!visible) add(scores, "publier", 3.2);
  if (trafficN < 0.2) add(scores, "publier", 1.4);
  if (mapsDriven || searchDriven) add(scores, "publier", 0.6);

  if (highOpp) add(scores, "offrir", 2.1);
  if (visible) add(scores, "offrir", 1.2);
  if (lowActions) add(scores, "offrir", 1.6);
  if (searchDriven) add(scores, "offrir", 1.0);

  if (visible) add(scores, "recolter", 2.0);
  if (mapsDriven || searchDriven) add(scores, "recolter", 1.2);
  if (lowActions) add(scores, "recolter", 1.3);
  if (qualityN >= 0.55) add(scores, "recolter", 0.6);

  if (qualityN >= 0.68) add(scores, "informer", 1.7);
  if (actionsPresent) add(scores, "informer", 0.8);
  if (p.balanced) add(scores, "informer", 0.9);
  if (!highOpp) add(scores, "informer", 0.5);

  if (actionsPresent) add(scores, "suivre", 3.2);
  if (trafficN >= 0.35) add(scores, "suivre", 1.0);
  if (qualityN >= 0.65) add(scores, "suivre", 0.9);
  if (p.clickShare >= 0.2) add(scores, "suivre", 0.8);

  if (contradiction > 0) add(scores, "enqueter", 3.2 * contradiction);
  if (visible && lowActions && highOpp) add(scores, "enqueter", 1.8);
  if (qualityN < 0.55) add(scores, "enqueter", 1.0);
  if (mapsDriven !== searchDriven && p.dominantShare >= 0.75) add(scores, "enqueter", 0.8);

  return scores;
}

function buildRawScores(input: DecisionInput, p: ProvenanceSummary): ScoreCard {
  if (input.channelType === "social") return socialRawScores(input, p);
  if (input.channelType === "gmb") return gmbRawScores(input, p);
  return websiteRawScores(input, p);
}

export function decideAction(input: DecisionInput): DecisionResult {
  if (input?.connected === false) {
    return {
      mode: "booster",
      action: "publier",
      reason: "Canal non connecté ou inactif : il faut d'abord le brancher pour pouvoir l'exploiter.",
      confidence: 100,
      ranking: [{ action: "publier", score: 100 }],
    };
  }

  const p = buildProvenanceSummary(input?.provenance);
  const rawScores = buildRawScores(input, p);
  const scores = normalizeScores(rawScores);
  const ranking = sortRanking(scores);
  const action = bestAction(scores);
  const mode: ModeType = action === "publier" || action === "offrir" || action === "recolter" ? "booster" : "fideliser";

  return {
    mode,
    action,
    reason: makeReason(action, input.channelType, p, Math.round(n(input.opportunities)), Math.round(n(input.quality))),
    confidence: confidenceFromRanking(ranking),
    ranking,
  };
}
