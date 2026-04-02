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
  dominantLabel: string;
  dominantShare: number;
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

  const share = (matcher: (label: string) => boolean) => {
    if (total <= 0) return 0;
    return clamp(
      safeEntries.filter((entry) => matcher(entry.label.toLowerCase())).reduce((sum, entry) => sum + entry.value, 0) / total,
    );
  };

  return {
    dominantLabel: dominant.label,
    dominantShare: total > 0 ? clamp(dominant.value / total) : 0,
    googleShare: share((label) => label.includes("google")),
    directShare: share((label) => label.includes("direct")),
    socialShare: share((label) => label.includes("social")),
    searchShare: share((label) => label.includes("search")),
    mapsShare: share((label) => label.includes("maps")),
    audienceShare: share((label) => label.includes("audience") || label.includes("impression")),
    interactionShare: share((label) => label.includes("interaction") || label.includes("engagement")),
    clickShare: share((label) => label.includes("clic")),
    balanced: total > 0 ? dominant.value / total <= 0.65 : false,
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
    .map(([action, score]) => ({ action, score: Math.max(0, Math.round(score)) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return ACTION_PRIORITY[b.action] - ACTION_PRIORITY[a.action];
    });
}

function confidenceFromRanking(ranking: RankedAction[]): number {
  const first = ranking[0]?.score ?? 0;
  const second = ranking[1]?.score ?? 0;
  return Math.round(clamp((first - second) / 5, 0, 1) * 100);
}

function selectAction(mode: ModeType, scores: ScoreCard): ActionType {
  const allowed: ActionType[] = mode === "booster" ? ["publier", "recolter", "offrir"] : ["informer", "suivre", "enqueter"];
  return allowed.sort((a, b) => {
    if (scores[b] !== scores[a]) return scores[b] - scores[a];
    return ACTION_PRIORITY[b] - ACTION_PRIORITY[a];
  })[0];
}

function makeReason(action: ActionType, channelType: ChannelType, p: ProvenanceSummary, opp: number, quality: number) {
  const channelLabel = channelType === "website" ? "site" : channelType === "social" ? "réseau" : "fiche locale";
  const dominant = p.dominantLabel ? ` La provenance dominante est « ${p.dominantLabel} ». ` : " ";

  if (action === "publier") {
    return `Le ${channelLabel} n'active pas encore assez d'opportunités (${opp}).${dominant}La priorité est de relancer la visibilité et le mouvement du canal.`;
  }
  if (action === "offrir") {
    return `Le ${channelLabel} capte déjà de l'attention mais transforme encore trop peu.${dominant}Il faut pousser une offre claire, visible et immédiatement actionnable.`;
  }
  if (action === "recolter") {
    return `Le ${channelLabel} montre déjà des signaux utiles mais manque de preuves pour rassurer et convertir.${dominant}Il faut récolter avis, retours ou cas clients.`;
  }
  if (action === "informer") {
    return `Le ${channelLabel} fonctionne déjà correctement (${opp} opportunités, qualité ${quality}/100).${dominant}Le bon levier est d'informer régulièrement pour entretenir la relation.`;
  }
  if (action === "suivre") {
    return `Le ${channelLabel} fonctionne déjà et génère des signaux business exploitables.${dominant}La priorité est maintenant le suivi : réponse, relance, remerciement et conversion.`;
  }
  return `Le ${channelLabel} génère des opportunités mais les signaux restent contradictoires.${dominant}Avant d'accélérer, il faut enquêter pour comprendre ce qui bloque.`;
}

function detectMode(input: DecisionInput, p: ProvenanceSummary): ModeType {
  const opp = n(input.opportunities);
  const quality = n(input.quality);
  const traffic = n(input.metrics?.traffic);
  const engagement = n(input.metrics?.engagement);
  const audience = n(input.metrics?.audience);
  const conversions = n(input.metrics?.conversions);
  const visibility = n(input.metrics?.visibility);
  const intent = n(input.metrics?.intent);

  if (input.channelType === "website") {
    return opp >= 5 ? "fideliser" : "booster";
  }

  if (input.channelType === "gmb") {
    const localDemand = visibility >= 250 || conversions >= 3 || p.mapsShare >= 0.4 || p.googleShare >= 0.5;
    const localHealthy = opp >= 4 && localDemand && quality >= 50;
    return localHealthy ? "fideliser" : "booster";
  }

  const socialHealthy =
    opp >= 6 &&
    (
      engagement >= 20 ||
      audience >= 150 ||
      conversions >= 2 ||
      visibility >= 300 ||
      p.interactionShare >= 0.35
    );

  if (socialHealthy) return "fideliser";

  const hasSocialMotion = engagement >= 10 || audience >= 100 || visibility >= 200 || p.audienceShare >= 0.4;
  return hasSocialMotion && opp >= 8 && quality >= 55 ? "fideliser" : "booster";
}

function scoreBooster(input: DecisionInput, p: ProvenanceSummary): ScoreCard {
  const scores = emptyScores();
  const quality = n(input.quality);
  const opp = n(input.opportunities);
  const audience = n(input.metrics?.audience);
  const engagement = n(input.metrics?.engagement);
  const traffic = n(input.metrics?.traffic);
  const conversions = n(input.metrics?.conversions);
  const intent = n(input.metrics?.intent);
  const visibility = n(input.metrics?.visibility);

  addMany(scores, ["publier", "recolter", "offrir"], 1);

  if (input.channelType === "website") {
    if (opp <= 2) add(scores, "publier", 4);
    else if (opp <= 4) add(scores, "publier", 2);

    if (quality < 70) add(scores, "publier", 2);
    if (quality < 60) add(scores, "publier", 3);
    if (quality < 55) add(scores, "offrir", 1);

    if (traffic > 0 && conversions <= 0) add(scores, "offrir", 4);
    if (intent > 0 && conversions <= 0) add(scores, "offrir", 3);
    if (p.googleShare + p.searchShare >= 0.45) add(scores, "offrir", 2);
    if (p.directShare >= 0.4 && conversions <= 0) add(scores, "offrir", 1);

    if (traffic > 0 && quality >= 65 && conversions <= 0) add(scores, "recolter", 2);
    if (conversions > 0 && conversions < 3) add(scores, "recolter", 1);
  }

  if (input.channelType === "social") {
    if (opp <= 3) add(scores, "publier", 3);
    if (audience < 120 || visibility < 150) add(scores, "publier", 3);
    if (quality < 55) add(scores, "publier", 2);
    if (p.audienceShare >= 0.45) add(scores, "publier", 2);

    if (engagement > 0 && conversions <= 0) add(scores, "recolter", 3);
    if (engagement >= 8 && audience >= 120 && conversions <= 1) add(scores, "recolter", 2);
    if (p.interactionShare >= 0.35) add(scores, "recolter", 2);

    if ((engagement >= 12 || traffic > 0) && conversions <= 0) add(scores, "offrir", 2);
    if (p.clickShare >= 0.25) add(scores, "offrir", 2);
  }

  if (input.channelType === "gmb") {
    if (opp <= 2) add(scores, "publier", 3);
    if (visibility < 220) add(scores, "publier", 3);
    if (quality < 55) add(scores, "publier", 1);

    if (visibility >= 220 && conversions <= 1) add(scores, "recolter", 3);
    if (p.mapsShare >= 0.45 && conversions <= 1) add(scores, "recolter", 2);

    if (conversions > 0 && conversions < 4) add(scores, "offrir", 3);
    if (p.searchShare >= 0.35 || p.googleShare >= 0.45) add(scores, "offrir", 2);
  }

  return scores;
}

function scoreFideliser(input: DecisionInput, p: ProvenanceSummary): ScoreCard {
  const scores = emptyScores();
  const quality = n(input.quality);
  const opp = n(input.opportunities);
  const audience = n(input.metrics?.audience);
  const engagement = n(input.metrics?.engagement);
  const traffic = n(input.metrics?.traffic);
  const conversions = n(input.metrics?.conversions);
  const intent = n(input.metrics?.intent);
  const visibility = n(input.metrics?.visibility);

  addMany(scores, ["informer", "suivre", "enqueter"], 1);

  if (input.channelType === "website") {
    if (opp >= 10) add(scores, "suivre", 2);
    if (conversions > 0) add(scores, "suivre", 4);
    if (quality >= 70) add(scores, "suivre", 2);
    if (p.directShare >= 0.35 || p.googleShare >= 0.35) add(scores, "suivre", 1);

    if (quality >= 65 && conversions <= 0 && engagement > 0) add(scores, "informer", 2);
    if (p.balanced) add(scores, "informer", 1);

    const contradictorySignals = (traffic > 30 && conversions <= 0) || (intent > 0 && conversions <= 0) || (p.directShare >= 0.4 && conversions <= 0);
    if (contradictorySignals) add(scores, "enqueter", 4);
    if (quality < 70 && contradictorySignals) add(scores, "enqueter", 2);
  }

  if (input.channelType === "social") {
    if (opp >= 8) add(scores, "suivre", 1);
    if (engagement >= 20 || conversions >= 2) add(scores, "suivre", 4);
    if (p.interactionShare >= 0.35) add(scores, "suivre", 1);

    if (audience >= 150 && engagement >= 8 && conversions <= 1) add(scores, "informer", 3);
    if (p.audienceShare >= 0.4 && engagement >= 8) add(scores, "informer", 1);

    if (audience >= 200 && engagement < 8) add(scores, "enqueter", 4);
    if (visibility >= 300 && conversions <= 0 && engagement < 10) add(scores, "enqueter", 2);
  }

  if (input.channelType === "gmb") {
    if (opp >= 5) add(scores, "suivre", 1);
    if (conversions >= 3) add(scores, "suivre", 4);
    if (p.mapsShare >= 0.4 && conversions >= 2) add(scores, "suivre", 1);

    if (visibility >= 250 && conversions >= 2) add(scores, "informer", 2);
    if (p.balanced) add(scores, "informer", 1);

    if (visibility >= 250 && conversions <= 1) add(scores, "enqueter", 4);
    if (p.mapsShare >= 0.45 && conversions <= 1) add(scores, "enqueter", 1);
  }

  return scores;
}

export function decideAction(input: DecisionInput): DecisionResult {
  if (input.connected === false) {
    return {
      mode: "booster",
      action: "publier",
      reason: "Le canal n'est pas encore connecté : commencez par l'activer pour pouvoir exploiter ses données.",
      confidence: 100,
      ranking: [
        { action: "publier", score: 100 },
        { action: "offrir", score: 0 },
        { action: "recolter", score: 0 },
      ],
    };
  }

  const p = buildProvenanceSummary(input.provenance);
  const mode = detectMode(input, p);
  const rawScores = mode === "booster" ? scoreBooster(input, p) : scoreFideliser(input, p);
  const action = selectAction(mode, rawScores);
  const ranking = sortRanking(rawScores).filter((entry) =>
    mode === "booster"
      ? ["publier", "recolter", "offrir"].includes(entry.action)
      : ["informer", "suivre", "enqueter"].includes(entry.action),
  );

  return {
    mode,
    action,
    reason: makeReason(action, input.channelType, p, n(input.opportunities), n(input.quality)),
    confidence: confidenceFromRanking(ranking),
    ranking,
  };
}
