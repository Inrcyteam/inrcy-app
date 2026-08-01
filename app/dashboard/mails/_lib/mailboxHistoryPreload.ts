export type MailboxHistoryFolder =
  | "mails"
  | "factures"
  | "devis"
  | "publications"
  | "recoltes"
  | "offres"
  | "informations"
  | "suivis"
  | "enquetes"
  | "propulsions"
  | "fidelisations"
  | "stats";

export type MailboxHistoryBoxView = "sent" | "drafts";
export type MailboxHistoryCounts = Record<MailboxHistoryFolder, number>;

export const MAILBOX_HISTORY_CACHE_TTL_MS = 2 * 60 * 1000;
export const MAILBOX_HISTORY_PREFETCH_CONCURRENCY = 2;

export type MailboxHistoryContext = {
  folder: MailboxHistoryFolder;
  boxView: MailboxHistoryBoxView;
  filterAccountId: string;
  query: string;
};

export type MailboxHistorySnapshot<TItem = unknown> = {
  items: TItem[];
  page: number;
  total: number | null;
  hasMore: boolean;
  folderCounts?: MailboxHistoryCounts;
  draftFolderCounts?: MailboxHistoryCounts;
  fetchedAt: number;
};

export type MailboxHistoryPreloadJob = {
  context: MailboxHistoryContext;
  page: number;
  total: number;
};

export function normalizeMailboxHistoryQuery(value: string): string {
  return String(value || "").trim();
}

export function mailboxHistoryGroupKey(
  context: Omit<MailboxHistoryContext, "folder">,
): string {
  return [
    `box=${context.boxView}`,
    `account=${encodeURIComponent(String(context.filterAccountId || ""))}`,
    `query=${encodeURIComponent(normalizeMailboxHistoryQuery(context.query).toLowerCase())}`,
  ].join("|");
}

export function mailboxHistoryContextKey(context: MailboxHistoryContext): string {
  return `${mailboxHistoryGroupKey(context)}|folder=${context.folder}`;
}

export function mailboxHistoryPageKey(
  context: MailboxHistoryContext,
  page: number,
): string {
  return `${mailboxHistoryContextKey(context)}|page=${Math.max(1, Math.floor(page || 1))}`;
}

export function isMailboxHistorySnapshotFresh<TItem>(
  snapshot: MailboxHistorySnapshot<TItem> | null | undefined,
  now = Date.now(),
): snapshot is MailboxHistorySnapshot<TItem> {
  return Boolean(
    snapshot &&
      Number.isFinite(snapshot.fetchedAt) &&
      now - snapshot.fetchedAt <= MAILBOX_HISTORY_CACHE_TTL_MS,
  );
}

export function mailboxHistoryPageCount(total: number, pageSize: number): number {
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
  const safePageSize = Math.max(1, Math.floor(Number(pageSize) || 1));
  return Math.max(1, Math.ceil(safeTotal / safePageSize));
}

export function buildMailboxHistoryPreloadPlan(options: {
  folders: readonly MailboxHistoryFolder[];
  currentContext: MailboxHistoryContext;
  currentPage: number;
  pageSize: number;
  folderCounts: MailboxHistoryCounts;
  draftFolderCounts: MailboxHistoryCounts;
  includeSiblingFolders: boolean;
}): MailboxHistoryPreloadJob[] {
  const {
    folders,
    currentContext,
    currentPage,
    pageSize,
    folderCounts,
    draftFolderCounts,
    includeSiblingFolders,
  } = options;
  const activeCounts = currentContext.boxView === "drafts" ? draftFolderCounts : folderCounts;
  const jobs: MailboxHistoryPreloadJob[] = [];
  const currentTotal = Math.max(0, Number(activeCounts[currentContext.folder] || 0));
  const currentPageCount = mailboxHistoryPageCount(currentTotal, pageSize);

  // Priority 1: all remaining pages of the active tab, nearest page first.
  for (let offset = 1; offset < currentPageCount; offset += 1) {
    const nextPage = currentPage + offset;
    if (nextPage <= currentPageCount) {
      jobs.push({ context: currentContext, page: nextPage, total: currentTotal });
    }
    const previousPage = currentPage - offset;
    if (previousPage >= 1) {
      jobs.push({ context: currentContext, page: previousPage, total: currentTotal });
    }
  }

  if (!includeSiblingFolders) return dedupeMailboxHistoryPreloadJobs(jobs);

  const siblingFolders = folders.filter((folder) => folder !== currentContext.folder);

  // Priority 2: first page of every other visible iNrSend tab.
  for (const folder of siblingFolders) {
    const total = Math.max(0, Number(activeCounts[folder] || 0));
    if (total <= 0) continue;
    jobs.push({
      context: { ...currentContext, folder },
      page: 1,
      total,
    });
  }

  // Priority 3: remaining pages of those tabs, progressively in the background.
  for (const folder of siblingFolders) {
    const total = Math.max(0, Number(activeCounts[folder] || 0));
    const pageCount = mailboxHistoryPageCount(total, pageSize);
    for (let page = 2; page <= pageCount; page += 1) {
      jobs.push({
        context: { ...currentContext, folder },
        page,
        total,
      });
    }
  }

  return dedupeMailboxHistoryPreloadJobs(jobs);
}

function dedupeMailboxHistoryPreloadJobs(
  jobs: MailboxHistoryPreloadJob[],
): MailboxHistoryPreloadJob[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = mailboxHistoryPageKey(job.context, job.page);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
