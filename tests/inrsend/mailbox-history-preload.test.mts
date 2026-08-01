import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  buildMailboxHistoryPreloadPlan,
  mailboxHistoryContextKey,
  mailboxHistoryPageCount,
  mailboxHistoryPageKey,
} from "../../app/dashboard/mails/_lib/mailboxHistoryPreload.ts";

const client = readFileSync("app/dashboard/mails/MailboxClient.tsx", "utf8");
const list = readFileSync("app/dashboard/mails/_components/MailboxList.tsx", "utf8");
const styles = readFileSync("app/dashboard/mails/mails.module.css", "utf8");
const route = readFileSync("app/api/inrsend/history/route.ts", "utf8");

function emptyFolderCounts() {
  return {
    mails: 0,
    factures: 0,
    devis: 0,
    publications: 0,
    recoltes: 0,
    offres: 0,
    informations: 0,
    suivis: 0,
    enquetes: 0,
    propulsions: 0,
    fidelisations: 0,
    stats: 0,
  };
}

test("preload prioritizes the active tab then warms every iNrSend tab", () => {
  const folderCounts = {
    ...emptyFolderCounts(),
    publications: 71,
    propulsions: 21,
    fidelisations: 1,
    mails: 40,
  };
  const currentContext = {
    folder: "publications" as const,
    boxView: "sent" as const,
    filterAccountId: "",
    query: "",
  };
  const plan = buildMailboxHistoryPreloadPlan({
    folders: ["publications", "propulsions", "fidelisations", "mails"],
    currentContext,
    currentPage: 1,
    pageSize: 20,
    folderCounts,
    draftFolderCounts: emptyFolderCounts(),
    includeSiblingFolders: true,
  });

  assert.deepEqual(
    plan.slice(0, 3).map((job) => [job.context.folder, job.page]),
    [["publications", 2], ["publications", 3], ["publications", 4]],
  );
  assert.ok(plan.some((job) => job.context.folder === "propulsions" && job.page === 1));
  assert.ok(plan.some((job) => job.context.folder === "mails" && job.page === 2));
  assert.equal(new Set(plan.map((job) => mailboxHistoryPageKey(job.context, job.page))).size, plan.length);
});

test("search preloads all pages of the active result without warming sibling tabs", () => {
  const counts = { ...emptyFolderCounts(), publications: 42, mails: 18 };
  const plan = buildMailboxHistoryPreloadPlan({
    folders: ["publications", "mails"],
    currentContext: {
      folder: "publications",
      boxView: "sent",
      filterAccountId: "account-1",
      query: "promo",
    },
    currentPage: 2,
    pageSize: 20,
    folderCounts: counts,
    draftFolderCounts: emptyFolderCounts(),
    includeSiblingFolders: false,
  });
  assert.deepEqual(
    plan.map((job) => [job.context.folder, job.page]),
    [["publications", 3], ["publications", 1]],
  );
});

test("history keys isolate folder, box, account and search contexts", () => {
  const base = {
    folder: "mails" as const,
    boxView: "sent" as const,
    filterAccountId: "box@example.com",
    query: " Client VIP ",
  };
  assert.match(mailboxHistoryContextKey(base), /folder=mails/);
  assert.notEqual(
    mailboxHistoryContextKey(base),
    mailboxHistoryContextKey({ ...base, boxView: "drafts" }),
  );
  assert.equal(mailboxHistoryPageCount(71, 20), 4);
});

test("client cache and API use lightweight background preloading", () => {
  assert.match(client, /historyCacheRef/);
  assert.match(client, /buildMailboxHistoryPreloadPlan/);
  assert.match(client, /includeSiblingFolders:\s*!context\.query/);
  assert.match(client, /MAILBOX_HISTORY_PREFETCH_CONCURRENCY/);
  assert.match(client, /params\.set\("includeCounts", "0"\)/);
  assert.match(route, /const includeCounts = url\.searchParams\.get\("includeCounts"\) !== "0"/);
  assert.match(route, /if \(!includeCounts\)/);
  assert.match(route, /if \(includeCounts && boxView !== "drafts"/);
  assert.match(route, /countsIncluded:\s*false/);
});

test("pagination footer is compact and keeps the list visible during page refresh", () => {
  assert.match(list, /const showInitialLoading = loading && visibleItems\.length === 0/);
  assert.doesNotMatch(list, /Actualisation de la liste/);
  assert.doesNotMatch(list, /← Précédent|Suivant →|Affichage \$\{/);
  assert.match(list, /\{historyPage\} \/ \{historyPageTotalLabel\}/);
  assert.match(list, /historyRangeLabel/);
  assert.match(list, /listFooterRefreshButton/);
  assert.match(styles, /\.listFooterPagerRow[\s\S]*grid-template-columns:\s*42px minmax\(64px, 1fr\) 42px/);
  assert.match(styles, /inrsendFooterRefreshSpin/);
});
