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
export const MAILBOX_HISTORY_PREFETCH_CONCURRENCY = 1;
export const MAILBOX_HISTORY_MAX_PRELOAD_JOBS = 1;
export const MAILBOX_HISTORY_ACTIVE_REFRESH_MS = 10_000;
export const MAILBOX_HISTORY_IDLE_REFRESH_MS = 60_000;

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
  total: number | null;
};

export function mailboxHistoryRefreshInterval(options: {
  context: MailboxHistoryContext;
  items: { status?: unknown; created_at?: unknown }[];
  now?: number;
}): number {
  void options.items;
  void options.now;
  if (
    options.context.folder !== "publications" ||
    options.context.boxView !== "sent"
  ) {
    return MAILBOX_HISTORY_IDLE_REFRESH_MS;
  }
  // A just-accepted publication may not be present in the current snapshot yet.
  // Refresh the visible Publications folder every ten seconds independently of
  // Realtime so the row and its channel statuses appear without a manual reload.
  return MAILBOX_HISTORY_ACTIVE_REFRESH_MS;
}

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
  currentContext: MailboxHistoryContext;
  currentPage: number;
  pageSize: number;
  currentTotal: number | null;
  currentHasMore: boolean;
}): MailboxHistoryPreloadJob[] {
  const {
    currentContext,
    currentPage,
    pageSize,
    currentTotal,
    currentHasMore,
  } = options;
  const explicitTotal = typeof currentTotal === "number"
    ? Math.max(0, Number(currentTotal))
    : null;
  const nextPage = Math.max(1, currentPage) + 1;
  const hasNextPage = explicitTotal == null
    ? currentHasMore === true
    : nextPage <= mailboxHistoryPageCount(explicitTotal, pageSize);

  if (!hasNextPage) return [];

  // One adjacent page is enough to make "Suivant" feel instant. Preloading
  // every remaining page and every sibling folder multiplies Supabase reads
  // without improving the page currently visible to the user.
  return dedupeMailboxHistoryPreloadJobs([
    { context: currentContext, page: nextPage, total: explicitTotal },
  ]).slice(0, MAILBOX_HISTORY_MAX_PRELOAD_JOBS);
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
