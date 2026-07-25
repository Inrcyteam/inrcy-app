import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isDashboardRequiredSetupProtectedDestination,
  isDashboardRequiredSetupProtectedLocation,
} from "../../lib/dashboardRequiredSetupAccess.ts";

const protectedDestinations = [
  "/dashboard?action=publish",
  "/dashboard?stats=1",
  "/dashboard?draftId=abc",
  "/dashboard?action=cash",
  "/dashboard/booster",
  "/dashboard/agent",
  "/dashboard/mails",
  "/dashboard/propulser",
  "/dashboard/fideliser",
  "/dashboard/factures",
  "/dashboard/factures/new",
  "/dashboard/devis",
  "/dashboard/devis/new?saveId=abc",
  "https://app.inrcy.com/dashboard/agent",
];

const allowedDestinations = [
  "/dashboard",
  "/dashboard?panel=profil",
  "/dashboard?panel=activite",
  "/dashboard?panel=ia",
  "/dashboard/stats",
  "/dashboard/crm",
  "/dashboard/agenda",
  "/dashboard/e-reputation",
  "/dashboard/mediatheque",
  "/dashboard/gps",
];

test("protects every module that requires Profil and Activité", () => {
  for (const href of protectedDestinations) {
    assert.equal(isDashboardRequiredSetupProtectedDestination(href), true, href);
  }
});

test("keeps dashboard, settings, iNrStats and iNrCRM accessible", () => {
  for (const href of allowedDestinations) {
    assert.equal(isDashboardRequiredSetupProtectedDestination(href), false, href);
  }
});

test("classifies the current dashboard location with readonly search params", () => {
  const query = new URLSearchParams("action=publish");
  assert.equal(isDashboardRequiredSetupProtectedLocation("/dashboard", query), true);
  assert.equal(isDashboardRequiredSetupProtectedLocation("/dashboard/stats", query), false);
});

const layoutSource = readFileSync(
  new URL("../../app/dashboard/layout.tsx", import.meta.url),
  "utf8",
);
const gateSource = readFileSync(
  new URL("../../app/dashboard/_components/DashboardRequiredSetupGate.tsx", import.meta.url),
  "utf8",
);
const dashboardClientSource = readFileSync(
  new URL("../../app/dashboard/DashboardClient.tsx", import.meta.url),
  "utf8",
);
const bottomNavSource = readFileSync(
  new URL("../../app/dashboard/_components/ResponsiveBottomNav.tsx", import.meta.url),
  "utf8",
);
const modulesSource = readFileSync(
  new URL("../../app/dashboard/_components/DashboardModulesCard.tsx", import.meta.url),
  "utf8",
);
const completionHookSource = readFileSync(
  new URL("../../app/dashboard/_hooks/useDashboardCompletionChecks.ts", import.meta.url),
  "utf8",
);
const serverGuardSource = readFileSync(
  new URL("../../lib/dashboardRequiredSetupServer.ts", import.meta.url),
  "utf8",
);
const dashboardPageSource = readFileSync(
  new URL("../../app/dashboard/page.tsx", import.meta.url),
  "utf8",
);

test("dashboard layout blocks direct URLs before rendering protected tools", () => {
  assert.match(layoutSource, /DashboardRequiredSetupGate/);
  assert.match(gateSource, /isDashboardRequiredSetupProtectedLocation/);
  assert.match(gateSource, /router\.replace\("\/dashboard"\)/);
  assert.match(gateSource, /completionCheckReady/);
  assert.match(gateSource, /requiredSetupCompleted/);
});

test("dashboard and mobile navigation both stop protected module openings", () => {
  assert.match(dashboardClientSource, /goToRequiredSetupAwareModule/);
  assert.match(dashboardClientSource, /requiredSetupAccessAllowed \? dashboardBoosterModal : null/);
  assert.match(bottomNavSource, /isDashboardRequiredSetupProtectedDestination\(href\)/);
  assert.match(modulesSource, /if \(!requiredSetupAccessAllowed\) return;/);
});

test("completion state synchronizes across dashboard, gate and responsive navigation", () => {
  assert.match(completionHookSource, /DASHBOARD_COMPLETION_STATE_EVENT/);
  assert.match(completionHookSource, /broadcastCompletionState/);
  assert.match(completionHookSource, /completionRefreshGenerationByAccount/);
});

test("protected pages are also rejected server-side", () => {
  assert.match(serverGuardSource, /evaluateDashboardRequiredSetupCompletion/);
  assert.match(serverGuardSource, /activeUserId/);
  assert.match(serverGuardSource, /redirect\("\/dashboard"\)/);
  assert.match(dashboardPageSource, /requireDashboardRequiredSetupCompleted/);

  for (const directory of ["agent", "mails", "propulser", "fideliser", "booster", "factures", "devis"]) {
    const source = readFileSync(
      new URL(`../../app/dashboard/${directory}/layout.tsx`, import.meta.url),
      "utf8",
    );
    assert.match(source, /requireDashboardRequiredSetupCompleted/);
  }
});
