// lib/decision/decisionEngine.ts

type ActionType =
  | "publier"
  | "offrir"
  | "recolter"
  | "informer"
  | "suivre"
  | "enqueter";

type ModeType = "booster" | "fideliser";

export type DecisionResult = {
  mode: ModeType;
  action: ActionType;
  reason: string;
};

export function decideAction(cube: any): DecisionResult {
  const opp = Number(cube?.opportunities ?? 0);
  const quality = Number(cube?.quality ?? 0);

  const audience = Number(cube?.metrics?.audience ?? 0);
  const engagement = Number(cube?.metrics?.engagement ?? 0);
  const traffic = Number(cube?.metrics?.traffic ?? 0);

  const hasTraffic = traffic > 0;
  const hasAudience = audience > 0;
  const hasEngagement = engagement > 0;

  // 🔴 1. Aucun trafic ni audience → publier
  if (!hasAudience && !hasTraffic) {
    return {
      mode: "booster",
      action: "publier",
      reason: "Aucune visibilité détectée",
    };
  }

  // 🟠 2. Visibilité mais pas d’engagement → offrir
  if ((hasAudience || hasTraffic) && !hasEngagement) {
    return {
      mode: "booster",
      action: "offrir",
      reason: "Trafic présent sans conversion",
    };
  }

  // 🟡 3. Données incohérentes → enquêter
  if (hasTraffic && hasAudience && engagement < audience * 0.01) {
    return {
      mode: "booster",
      action: "enqueter",
      reason: "Performance anormale détectée",
    };
  }

  // 🟢 4. Bon engagement → suivre
  if (hasEngagement && quality > 50) {
    return {
      mode: "fideliser",
      action: "suivre",
      reason: "Clients actifs à exploiter",
    };
  }

  // 🔵 5. Clients mais peu exploités → récolter
  if (hasEngagement && quality > 30 && opp < 5) {
    return {
      mode: "fideliser",
      action: "recolter",
      reason: "Base client sous-exploitée",
    };
  }

  // 🟣 6. Audience engagée → informer
  if (hasAudience && hasEngagement && opp > 10) {
    return {
      mode: "fideliser",
      action: "informer",
      reason: "Audience engagée à nourrir",
    };
  }

  // ⚪ fallback
  return {
    mode: "booster",
    action: "publier",
    reason: "Action par défaut",
  };
}