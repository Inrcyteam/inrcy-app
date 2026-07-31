import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("dashboard tool routes are prefetched and completion checks no longer swallow clicks while loading", () => {
  const dashboard = read("app/dashboard/DashboardClient.tsx");
  const bottomNav = read("app/dashboard/_components/ResponsiveBottomNav.tsx");
  const warmup = read("app/dashboard/_components/DashboardToolWarmup.tsx");
  assert.match(dashboard, /!completionCheckReady \|\| requiredSetupCompleted/);
  assert.match(bottomNav, /!completionCheckReady \|\| requiredSetupCompleted/);
  assert.match(warmup, /ROUTES_TO_PREFETCH\.forEach\(\(route\) => router\.prefetch\(route\)\)/);
  for (const route of [
    "/dashboard?action=publish",
    "/dashboard/crm",
    "/dashboard/agenda",
    "/dashboard/mails",
    "/dashboard/propulser",
    "/dashboard/fideliser",
    "/dashboard/factures",
    "/dashboard/devis",
    "/dashboard/stats",
    "/dashboard/e-reputation",
    "/dashboard/gps",
    "/dashboard/agent",
    "/dashboard/mediatheque",
  ]) {
    assert.ok(warmup.includes(route), `${route} doit être préchargée`);
  }
  assert.doesNotMatch(dashboard, /if \(!requiredSetupAccessAllowed\) return/);
  assert.doesNotMatch(bottomNav, /&& !requiredSetupAccessAllowed\) return/);
});

test("heavy dashboard tools hydrate from browser snapshots then refresh silently", () => {
  const mailbox = read("app/dashboard/mails/MailboxClient.tsx");
  const crm = read("app/dashboard/crm/CRMClient.tsx");
  const agenda = read("app/dashboard/agenda/AgendaClient.tsx");
  const propulser = read("app/dashboard/propulser/page.tsx");
  const fideliser = read("app/dashboard/fideliser/page.tsx");
  assert.match(mailbox, /MODULE_SNAPSHOT_KEYS\.inrSendDefault/);
  assert.match(mailbox, /silent: Boolean\(initialHistorySnapshot\)/);
  assert.match(crm, /MODULE_SNAPSHOT_KEYS\.crmDefault/);
  assert.match(agenda, /MODULE_SNAPSHOT_KEYS\.agendaMonth/);
  assert.match(propulser, /MODULE_SNAPSHOT_KEYS\.propulserMetrics/);
  assert.match(fideliser, /MODULE_SNAPSHOT_KEYS\.fideliserMetrics/);
  const documents = read("app/dashboard/factures/ListPage.tsx");
  const mediaLibrary = read("app/dashboard/mediatheque/MediaLibraryClient.tsx");
  const agentRuntime = read("app/dashboard/agent/_hooks/useAgentRuntimeData.ts");
  assert.match(documents, /MODULE_SNAPSHOT_KEYS\.facturesList/);
  assert.match(documents, /MODULE_SNAPSHOT_KEYS\.devisList/);
  assert.match(mediaLibrary, /MODULE_SNAPSHOT_KEYS\.mediaLibraryDefault/);
  assert.match(agentRuntime, /warmAgentRuntimeSnapshot/);
});

test("previous and next navigation is shared by CRM, Calendar, Propulser and Fideliser, including mobile", () => {
  const crmModal = read("app/dashboard/crm/_components/CRMContactModal.tsx");
  const agendaUi = read("app/dashboard/agenda/agenda.ui.tsx");
  const agendaCss = read("app/dashboard/agenda/agenda.module.css");
  const propulser = read("app/dashboard/propulser/page.tsx");
  const fideliser = read("app/dashboard/fideliser/page.tsx");
  for (const source of [crmModal, agendaUi, propulser, fideliser]) {
    assert.match(source, /DetailSequenceNavigation/);
  }
  assert.match(propulser, /PROPULSER_THEMES = \["valorize", "reviews", "promo"\]/);
  assert.match(fideliser, /FIDELISER_THEMES = \["inform", "thanks", "satisfaction"\]/);
  assert.match(agendaCss, /Navigation événement précédente \/ suivante toujours accessible sur mobile/);
  const crm = read("app/dashboard/crm/CRMClient.tsx");
  assert.match(crm, /contactListIsSinglePageWindow && page > 1/);
  assert.doesNotMatch(crm, /!isResponsive && page > 1/);
  const navigationCss = read("app/dashboard/_components/DetailSequenceNavigation.module.css");
  assert.match(navigationCss, /touch-action:\s*manipulation/);
});

test("obsolete Fideliser modal copy has been removed", () => {
  assert.equal(existsSync("app/dashboard/fideliser/components/BaseModal.tsx"), false);
  const fideliser = read("app/dashboard/fideliser/page.tsx");
  assert.match(fideliser, /\.\.\/_components\/WorkflowBaseModal/);
});
