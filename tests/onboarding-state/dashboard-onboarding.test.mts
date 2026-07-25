import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getDashboardOnboardingPanel,
  getDashboardOnboardingProgress,
  isDashboardOnboardingFirstOpening,
  normalizeDashboardOnboardingRow,
  shouldRunDashboardOnboarding,
} from "../../lib/dashboardOnboarding.ts";

const baseRow = {
  account_id: "11111111-1111-4111-8111-111111111111",
  version: 1,
  status: "pending",
  current_step: "profile",
  started_at: null,
  completed_at: null,
  deferred_at: null,
  created_at: "2026-07-25T20:00:00.000Z",
  updated_at: "2026-07-25T20:00:00.000Z",
};

test("normalizes a pending onboarding row", () => {
  const row = normalizeDashboardOnboardingRow(baseRow);
  assert.ok(row);
  assert.equal(row.accountId, baseRow.account_id);
  assert.equal(row.status, "pending");
  assert.equal(row.currentStep, "profile");
});

test("detects the first dashboard opening", () => {
  const row = normalizeDashboardOnboardingRow(baseRow);
  assert.equal(isDashboardOnboardingFirstOpening(row), true);
  assert.equal(shouldRunDashboardOnboarding(row), true);
});

test("completed existing accounts do not run onboarding", () => {
  const row = normalizeDashboardOnboardingRow({
    ...baseRow,
    status: "completed",
    current_step: "completed",
    started_at: "2026-07-25T20:00:00.000Z",
    completed_at: "2026-07-25T20:00:00.000Z",
  });
  assert.ok(row);
  assert.equal(isDashboardOnboardingFirstOpening(row), false);
  assert.equal(shouldRunDashboardOnboarding(row), false);
});

test("rejects inconsistent completed states", () => {
  const row = normalizeDashboardOnboardingRow({
    ...baseRow,
    status: "completed",
    current_step: "profile",
    completed_at: "2026-07-25T20:00:00.000Z",
  });
  assert.equal(row, null);
});

const migrationSql = readFileSync(
  new URL("../../ops/sql/2026-07-25_dashboard_onboarding_state.sql", import.meta.url),
  "utf8",
);

test("migration keeps existing accounts completed and future accounts pending", () => {
  assert.match(
    migrationSql,
    /from public\.inrcy_accounts a[\s\S]*on conflict \(account_id\) do nothing;/i,
  );
  assert.match(
    migrationSql,
    /values \(new\.id, 1, 'pending', 'profile'\)/i,
  );
  assert.match(
    migrationSql,
    /values[\s\S]*'completed'[\s\S]*'completed'/i,
  );
});

test("migration scopes reads and mutations to accessible establishments", () => {
  assert.match(
    migrationSql,
    /using \(public\.inrcy_can_access_account\(account_id\)\)/i,
  );
  assert.match(
    migrationSql,
    /not public\.inrcy_can_access_account\(p_account_id\)/i,
  );
  assert.match(
    migrationSql,
    /grant execute on function public\.inrcy_save_onboarding_state/i,
  );
});


test("maps onboarding steps to the existing dashboard drawers", () => {
  assert.equal(getDashboardOnboardingPanel("profile"), "profil");
  assert.equal(getDashboardOnboardingPanel("activity"), "activite");
  assert.equal(getDashboardOnboardingPanel("ai"), "ia");
  assert.equal(getDashboardOnboardingPanel("completed"), null);
});

test("exposes the three-step progress indicator", () => {
  assert.deepEqual(getDashboardOnboardingProgress("profile"), { current: 1, total: 3 });
  assert.deepEqual(getDashboardOnboardingProgress("activity"), { current: 2, total: 3 });
  assert.deepEqual(getDashboardOnboardingProgress("ai"), { current: 3, total: 3 });
  assert.equal(getDashboardOnboardingProgress("completed"), null);
});

const dashboardClientSource = readFileSync(
  new URL("../../app/dashboard/DashboardClient.tsx", import.meta.url),
  "utf8",
);

test("dashboard chains existing drawers without creating replacement forms", () => {
  assert.match(dashboardClientSource, /checkProfile\(\)[\s\S]*profileCompleted/);
  assert.match(dashboardClientSource, /setCurrentOnboardingStep\("activity"\)/);
  assert.match(dashboardClientSource, /openPanel\("activite"\)/);
  assert.match(dashboardClientSource, /checkActivity\(\)[\s\S]*activityCompleted/);
  assert.match(dashboardClientSource, /setCurrentOnboardingStep\("ai"\)/);
  assert.match(dashboardClientSource, /openPanel\("ia"\)/);
  assert.match(dashboardClientSource, /completeOnboardingFromAi/);
  assert.match(dashboardClientSource, /Configuration initiale · Étape/);
});

const onboardingHookSource = readFileSync(
  new URL("../../app/dashboard/_hooks/useDashboardOnboardingState.ts", import.meta.url),
  "utf8",
);

test("stale onboarding mutations cannot restore the previous establishment", () => {
  assert.match(onboardingHookSource, /mutationSequenceRef/);
  assert.match(onboardingHookSource, /activeAccountIdRef/);
  assert.match(onboardingHookSource, /accountId !== currentAccountId/);
  assert.match(onboardingHookSource, /mutationSequenceRef\.current \+= 1/);
  assert.match(onboardingHookSource, /activeAccountIdRef\.current = null/);
});
