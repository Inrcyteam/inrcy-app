import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PROFILE_VERSION_FIELDS,
  getChangedProfileVersionFields,
  toProfileVersionsSnapshot,
} from "../../lib/profileVersioning.ts";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const migration = read("ops/sql/2026-08-06_inrsend_realtime_version.sql");
const mailbox = read("app/dashboard/mails/MailboxClient.tsx");
const versionsRoute = read("app/api/profile/versions/route.ts");

test("inrsend_version appartient au pont realtime de profil", () => {
  assert.ok(PROFILE_VERSION_FIELDS.includes("inrsend_version"));
  const previous = toProfileVersionsSnapshot({ inrsend_version: 2 });
  const next = toProfileVersionsSnapshot({ inrsend_version: 3 });
  assert.equal(next.inrsend_version, 3);
  assert.deepEqual(getChangedProfileVersionFields(previous, next), [
    { field: "inrsend_version", previousValue: 2, value: 3 },
  ]);
});

test("iNrSend recharge son historique sur le compteur dédié et garde les signaux existants", () => {
  assert.match(mailbox, /detail\?\.field === "inrsend_version"/);
  assert.match(mailbox, /detail\?\.field === "docs_version"/);
  assert.match(mailbox, /detail\?\.field === "publications_version"/);
  assert.match(mailbox, /void loadHistory\(\{ silent: true, force: true \}\)/);
});

test("la migration couvre toutes les sources visibles de l'historique", () => {
  assert.match(migration, /add column if not exists inrsend_version bigint not null default 0/);
  assert.match(migration, /'inrsend_version'/);
  for (const trigger of [
    "trg_send_items_bump_inrsend_version",
    "trg_mail_campaigns_bump_inrsend_version",
    "trg_app_events_bump_inrsend_version",
    "trg_inr_agent_actions_bump_inrsend_version",
    "trg_inr_agent_scheduled_actions_bump_inrsend_version",
  ]) {
    assert.match(migration, new RegExp(trigger));
  }
});

test("les campagnes ignorent les heartbeats techniques mais gardent le suivi visible", () => {
  const campaignFunction = migration.match(
    /create or replace function public\.inrcy_bump_inrsend_for_mail_campaigns\(\)[\s\S]*?\n\$\$;/,
  )?.[0] || "";
  assert.match(campaignFunction, /'sent_count'/);
  assert.match(campaignFunction, /'progress_percent'/);
  assert.match(campaignFunction, /'last_error'/);
  assert.doesNotMatch(campaignFunction, /'updated_at'/);
  assert.doesNotMatch(campaignFunction, /'last_activity_at'/);
});

test("les événements techniques de publication ne provoquent pas de rafraîchissement en rafale", () => {
  assert.match(migration, /'publish_async_job'/);
  assert.match(migration, /'publish_async_channel'/);
  assert.match(migration, /'publish_idempotency_lock'/);
  assert.match(migration, /'publish'/);
  assert.match(migration, /array\['booster', 'propulser', 'fideliser'\]::text\[\]/);
});

test("le déploiement reste compatible si le SQL arrive juste après le code", () => {
  assert.match(versionsRoute, /includes\("inrsend_version"\)/);
  assert.match(versionsRoute, /field !== "inrsend_version"/);
  assert.match(versionsRoute, /toProfileVersionsSnapshot\(data \|\| \{\}\)/);
});
