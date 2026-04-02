export type ActionType =
  | "publier"
  | "offrir"
  | "recolter"
  | "informer"
  | "suivre"
  | "enqueter";

export type ModeType = "booster" | "fideliser";
export type ChannelType = "website" | "social" | "gmb";

export type DecisionInput = {
  channelType: ChannelType;
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

export type DecisionResult = {
  mode: ModeType;
  action: ActionType;
  reason: string;
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

function bestAction(scores: ScoreCard): ActionType {
  return (Object.entries(scores).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  })[0]?.[0] || "publier") as ActionType;
}

function makeReason(action: ActionType, channelType: ChannelType, p: ProvenanceSummary, opp: number, quality: number) {
  const channelLabel = channelType === "website" ? "site" : channelType === "social" ? "réseau" : "fiche locale";
  const dominant = p.dominantLabel ? ` La provenance dominante est « ${p.dominantLabel} ». ` : " ";

  if (action === "publier") {
    return `Le ${channelLabel} manque encore de mouvement visible.${dominant}Les signaux d'activité restent trop faibles pour convertir : il faut relancer la présence du canal.`;
  }
  if (action === "offrir") {
    return `Le ${channelLabel} attire déjà de l'attention et le potentiel est réel (${opp} opportunités).${dominant}Il faut maintenant proposer une offre claire pour transformer l'intérêt en prise de contact.`;
  }
  if (action === "recolter") {
    return `Le ${channelLabel} génère de la visibilité, mais la preuve sociale manque encore.${dominant}Récolter des avis, retours ou preuves de résultats aidera à convertir cette audience.`;
  }
  if (action === "informer") {
    return `Le ${channelLabel} est suffisamment sain (qualité ${quality}/100) pour nourrir la relation.${dominant}Informer régulièrement aidera à entretenir la confiance et préparer les prochaines demandes.`;
  }
  if (action === "suivre") {
    return `Le ${channelLabel} génère déjà des signaux business exploitables.${dominant}Le bon levier est maintenant le suivi : relance, réponse, remerciement et conversion.`;
  }
  return `Le ${channelLabel} montre des signaux utiles mais encore contradictoires.${dominant}Avant d'accélérer, il faut enquêter pour comprendre ce qui bloque ou ce qui manque.`;
}

function scoreWebsite(input: DecisionInput, p: ProvenanceSummary): ScoreCard {
  const scores = emptyScores();
  const traffic = n(input.metrics?.traffic);
  const engagement = n(input.metrics?.engagement);
  const intent = n(input.metrics?.intent);
  const conversions = n(input.metrics?.conversions);
  const visibility = n(input.metrics?.visibility);
  const opp = n(input.opportunities);
  const quality = n(input.quality);

  const trafficN = norm(traffic, 120);
  const visibilityN = norm(visibility, 1200);
  const engagementN = norm(engagement, 60);
  const intentN = norm(intent, 8);
  const conversionN = norm(conversions, 12);
  const oppN = norm(opp, 18);
  const qualityN = clamp(quality / 100);

  scores.publier =
    1.8 * (1 - trafficN) +
    1.5 * (1 - visibilityN) +
    0.8 * (1 - engagementN) +
    0.5 * p.socialShare +
    0.4 * (1 - oppN);

  scores.offrir =
    1.4 * trafficN +
    1.5 * intentN +
    1.6 * oppN +
    0.7 * p.googleShare +
    0.7 * p.searchShare +
    1.8 * (1 - conversionN);

  scores.recolter =
    1.3 * visibilityN +
    0.8 * trafficN +
    1.9 * (1 - conversionN) +
    0.9 * (p.googleShare + p.searchShare + p.socialShare) +
    0.6 * qualityN;

  scores.informer =
    0.9 * trafficN +
    0.8 * engagementN +
    0.8 * intentN +
    1.2 * qualityN +
    0.8 * (p.balanced ? 1 : 0) +
    0.5 * p.directShare +
    0.6 * conversionN;

  scores.suivre =
    1.5 * conversionN +
    1.2 * intentN +
    1.1 * qualityN +
    1.0 * p.directShare +
    0.6 * engagementN +
    0.4 * trafficN;

  scores.enqueter =
    1.5 * trafficN +
    1.0 * visibilityN +
    1.2 * oppN +
    0.9 * Math.abs(engagementN - conversionN) +
    0.8 * Math.abs(intentN - conversionN) +
    0.6 * p.dominantShare +
    0.7 * (1 - qualityN);

  return scores;
}

function scoreSocial(input: DecisionInput, p: ProvenanceSummary): ScoreCard {
  const scores = emptyScores();
  const audience = n(input.metrics?.audience);
  const engagement = n(input.metrics?.engagement);
  const conversions = n(input.metrics?.conversions);
  const visibility = n(input.metrics?.visibility);
  const opp = n(input.opportunities);
  const quality = n(input.quality);

  const audienceN = norm(audience, 4000);
  const engagementN = norm(engagement, 120);
  const conversionN = norm(conversions, 12);
  const visibilityN = norm(visibility, 4000);
  const oppN = norm(opp, 20);
  const qualityN = clamp(quality / 100);

  scores.publier =
    1.8 * (1 - visibilityN) +
    1.4 * (1 - engagementN) +
    0.9 * (1 - audienceN) +
    0.4 * (1 - oppN) +
    0.4 * p.audienceShare;

  scores.offrir =
    1.2 * visibilityN +
    1.3 * engagementN +
    1.9 * oppN +
    1.8 * (1 - conversionN) +
    0.8 * p.interactionShare +
    0.5 * audienceN;

  scores.recolter =
    1.4 * visibilityN +
    1.1 * engagementN +
    1.5 * (1 - conversionN) +
    0.9 * p.audienceShare +
    0.9 * p.interactionShare +
    0.5 * qualityN;

  scores.informer =
    1.1 * audienceN +
    1.0 * engagementN +
    0.8 * conversionN +
    1.1 * qualityN +
    0.7 * (p.balanced ? 1 : 0) +
    0.5 * oppN;

  scores.suivre =
    1.7 * conversionN +
    1.1 * engagementN +
    1.1 * qualityN +
    0.9 * p.interactionShare +
    0.4 * oppN;

  scores.enqueter =
    1.2 * visibilityN +
    1.0 * audienceN +
    1.0 * oppN +
    1.1 * Math.abs(engagementN - conversionN) +
    0.9 * p.dominantShare +
    0.8 * (1 - qualityN);

  return scores;
}

function scoreGmb(input: DecisionInput, p: ProvenanceSummary): ScoreCard {
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

  scores.publier =
    1.8 * (1 - visibilityN) +
    1.3 * (1 - trafficN) +
    0.7 * (1 - oppN) +
    0.6 * p.mapsShare;

  scores.offrir =
    1.2 * visibilityN +
    1.0 * trafficN +
    1.8 * oppN +
    1.7 * (1 - conversionN) +
    0.8 * p.searchShare;

  scores.recolter =
    1.7 * visibilityN +
    1.0 * trafficN +
    1.6 * (1 - conversionN) +
    0.9 * (p.searchShare + p.mapsShare) +
    0.5 * qualityN;

  scores.informer =
    0.9 * visibilityN +
    0.7 * trafficN +
    0.7 * conversionN +
    1.0 * qualityN +
    0.8 * (p.balanced ? 1 : 0) +
    0.6 * oppN;

  scores.suivre =
    1.8 * conversionN +
    1.0 * trafficN +
    1.0 * qualityN +
    0.8 * p.clickShare +
    0.5 * p.directShare;

  scores.enqueter =
    1.2 * visibilityN +
    1.2 * oppN +
    1.0 * Math.abs(trafficN - conversionN) +
    0.8 * p.dominantShare +
    0.8 * (1 - qualityN);

  return scores;
}

export function decideAction(input: DecisionInput): DecisionResult {
  if (input?.connected === false) {
    return {
      mode: "booster",
      action: "publier",
      reason: "Canal non connecté ou inactif : il faut d'abord le brancher pour pouvoir l'exploiter.",
    };
  }

  const p = buildProvenanceSummary(input?.provenance);
  let scores = emptyScores();

  if (input.channelType === "social") {
    scores = scoreSocial(input, p);
  } else if (input.channelType === "gmb") {
    scores = scoreGmb(input, p);
  } else {
    scores = scoreWebsite(input, p);
  }

  const action = bestAction(scores);
  const mode: ModeType = action === "publier" || action === "offrir" || action === "recolter" ? "booster" : "fideliser";

  return {
    mode,
    action,
    reason: makeReason(action, input.channelType, p, Math.round(n(input.opportunities)), Math.round(n(input.quality))),
  };
}
