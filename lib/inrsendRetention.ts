export type InrSendFolder =
  | "mails"
  | "factures"
  | "devis"
  | "publications"
  | "recoltes"
  | "offres"
  | "informations"
  | "suivis"
  | "enquetes";

export const INRSEND_RETENTION_MONTHS: Record<InrSendFolder, number | null> = {
  mails: 12,
  factures: null,
  devis: 24,
  publications: 12,
  recoltes: 12,
  offres: 12,
  informations: 12,
  suivis: 18,
  enquetes: 12,
};

const AUTO_RETENTION_FOLDERS = (Object.keys(INRSEND_RETENTION_MONTHS) as InrSendFolder[]).filter(
  (folder) => INRSEND_RETENTION_MONTHS[folder] != null,
);

export function getInrSendRetentionMonths(folder: InrSendFolder): number | null {
  return INRSEND_RETENTION_MONTHS[folder] ?? null;
}

function subtractMonths(now: Date, months: number) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d;
}

export function getInrSendRetentionCutoffIso(folder: InrSendFolder, now = new Date()): string | null {
  const months = getInrSendRetentionMonths(folder);
  if (months == null) return null;
  return subtractMonths(now, months).toISOString();
}

export function isInrSendItemRetained(folder: InrSendFolder, createdAt: string | null | undefined, now = new Date()) {
  const cutoffIso = getInrSendRetentionCutoffIso(folder, now);
  if (!cutoffIso) return true;
  const createdMs = new Date(String(createdAt || 0)).getTime();
  const cutoffMs = new Date(cutoffIso).getTime();
  if (!Number.isFinite(createdMs) || !Number.isFinite(cutoffMs)) return false;
  return createdMs >= cutoffMs;
}

export function getOldestAutoRetentionCutoffIso(folders: InrSendFolder[] = AUTO_RETENTION_FOLDERS, now = new Date()) {
  let oldestMonths: number | null = null;
  for (const folder of folders) {
    const months = getInrSendRetentionMonths(folder);
    if (months == null) continue;
    if (oldestMonths == null || months > oldestMonths) oldestMonths = months;
  }
  if (oldestMonths == null) return null;
  return subtractMonths(now, oldestMonths).toISOString();
}

export function getInrSendRetentionLabel(folder: InrSendFolder) {
  const months = getInrSendRetentionMonths(folder);
  if (months == null) return "suppression manuelle";
  return `${months} mois`;
}
