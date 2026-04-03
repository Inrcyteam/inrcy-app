export type GoalTone = "red" | "orange" | "green";

export const WEEKLY_GOALS = {
  booster: {
    publish: 1,
    reviews: 1,
    promo: 1,
  },
  fideliser: {
    inform: 1,
    thanks: 1,
    satisfaction: 1,
  },
} as const;

export function getIsoWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getIsoWeekId(date = new Date()) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function getGoalTone(done: number, goal: number): GoalTone {
  if (done <= 0) return "red";
  if (done < goal) return "orange";
  return "green";
}

export function getGoalCopy(done: number, goal: number) {
  const remaining = Math.max(goal - done, 0);
  const tone = getGoalTone(done, goal);
  if (tone === "red") {
    return {
      tone,
      short: "À lancer",
      action: "Commencer maintenant",
      hint: `Débloquez la mission hebdo avec ${goal} action${goal > 1 ? "s" : ""}.`,
    };
  }
  if (tone === "orange") {
    return {
      tone,
      short: "En route",
      action: "Continuer l'objectif",
      hint: `Encore ${remaining} action${remaining > 1 ? "s" : ""} pour passer au vert.`,
    };
  }
  return {
    tone,
    short: "Objectif atteint",
    action: "Relancer l'outil",
    hint: "Très bon rythme cette semaine.",
  };
}

export function clampProgress(done: number, goal: number) {
  if (!goal || goal <= 0) return 0;
  return Math.max(0, Math.min(done / goal, 1));
}
