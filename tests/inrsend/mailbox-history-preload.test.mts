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

test("preload is capped to the next page of the active tab", () => {
  const currentContext = {
    folder: "publications" as const,
    boxView: "sent" as const,
    filterAccountId: "",
    query: "",
  };
  const plan = buildMailboxHistoryPreloadPlan({
    currentContext,
    currentPage: 1,
    pageSize: 20,
    currentTotal: 71,
    currentHasMore: true,
  });

  assert.deepEqual(
    plan.map((job) => [job.context.folder, job.page]),
    [["publications", 2]],
  );
  assert.equal(plan.length, 1);
  assert.equal(plan.some((job) => job.context.folder !== "publications"), false);
  assert.equal(new Set(plan.map((job) => mailboxHistoryPageKey(job.context, job.page))).size, plan.length);
});

test("search preloads only the adjacent active result page", () => {
  const plan = buildMailboxHistoryPreloadPlan({
    currentContext: {
      folder: "publications",
      boxView: "sent",
      filterAccountId: "account-1",
      query: "promo",
    },
    currentPage: 2,
    pageSize: 20,
    currentTotal: 42,
    currentHasMore: true,
  });
  assert.deepEqual(
    plan.map((job) => [job.context.folder, job.page]),
    [["publications", 3]],
  );
});

test("preload does nothing when the current page has no successor", () => {
  const plan = buildMailboxHistoryPreloadPlan({
    currentContext: {
      folder: "publications",
      boxView: "sent",
      filterAccountId: "",
      query: "",
    },
    currentPage: 2,
    pageSize: 20,
    currentTotal: 40,
    currentHasMore: false,
  });
  assert.deepEqual(plan, []);
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

test("client and API keep history reads bounded and count-free by default", () => {
  assert.match(client, /historyCacheRef/);
  assert.match(client, /buildMailboxHistoryPreloadPlan/);
  assert.match(client, /currentHasMore:\s*snapshot\.hasMore/);
  assert.match(client, /MAILBOX_HISTORY_PREFETCH_CONCURRENCY/);
  assert.match(client, /params\.set\("includeCounts", "0"\)/);
  assert.match(route, /const includeCounts = url\.searchParams\.get\("includeCounts"\) === "1"/);
  assert.match(route, /MAX_SOURCE_BATCHES_PER_REQUEST = 40/);
  assert.match(route, /const targetVisibleCount = end \+ 1/);
  assert.doesNotMatch(route, /MAX_ITERATIONS = 5000|fetchAllRows/);
  assert.match(route, /if \(!includeCounts\)/);
  assert.match(route, /fetchBoundedRows/);
  assert.match(route, /countsIncluded:\s*false/);
  assert.doesNotMatch(client, /force:\s*shouldRefreshInitialSnapshot/);
});

test("the publications tab filters every source before downloading history rows", () => {
  assert.match(route, /MIN_SOURCE_BATCHES_PER_REQUEST = 1/);
  assert.match(
    route,
    /folder !== "stats" && folder !== "publications" && view !== "drafts"/,
  );
  assert.match(route, /builder = builder\.eq\("folder", "publications"\)/);
  assert.match(
    route,
    /\.eq\("module", "booster"\)[\s\S]{0,180}\.in\("type", \[\s*"publish",\s*"publish_draft",\s*"publish_async_job",\s*\]\)/,
  );
  assert.match(
    route,
    /!isTechnicalAppEvent\(e\) \|\| String\(e\.type \|\| ""\) === "publish_async_job"/,
  );
  assert.match(
    route,
    /const payload = isAsyncPublication[\s\S]{0,220}durablePayload\.preparationRequest[\s\S]{0,120}durablePayload\.finalPayloadBase/,
  );
  assert.match(
    route,
    /const eventStatus: Status =[\s\S]{0,120}isAsyncPublication[\s\S]{0,40}\? "processing"/,
  );
  const publicationTypeFilter = route.slice(
    route.indexOf('if (folder === "publications")'),
    route.indexOf('} else if (folder === "recoltes"'),
  );
  assert.doesNotMatch(
    publicationTypeFilter,
    /publish_async_channel|execution_idempotency_lock|publish_idempotency_lock/,
  );
  assert.ok(
    (route.match(/\.eq\("automation_key", "publish"\)/g) || []).length >= 2,
  );
  assert.ok(
    (route.match(/\.eq\("target_tool", "booster"\)/g) || []).length >= 2,
  );
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
