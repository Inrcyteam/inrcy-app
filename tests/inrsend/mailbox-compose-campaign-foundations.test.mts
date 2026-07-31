import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  asScheduledRecord,
  contactDepartment,
  inferTrackFromCampaign,
  normalizeCampaignAttachments,
  sanitizeCrmDepartmentFilter,
  serializeComposeAttachments,
  workflowDraftTargetFromSendItem,
} from "../../app/dashboard/mails/_lib/mailboxComposeCampaign.foundations.ts";

const client = readFileSync("app/dashboard/mails/MailboxClient.tsx", "utf8");
const foundations = readFileSync(
  "app/dashboard/mails/_lib/mailboxComposeCampaign.foundations.ts",
  "utf8",
);

test("MailboxClient delegates pure compose and campaign foundations", () => {
  assert.match(client, /from "\.\/_lib\/mailboxComposeCampaign\.foundations"/);
  for (const name of [
    "serializeComposeAttachments",
    "sanitizeCrmDepartmentFilter",
    "contactDepartment",
    "asScheduledRecord",
    "inferTrackFromCampaign",
    "normalizeCampaignAttachments",
    "workflowDraftTargetFromSendItem",
  ]) {
    assert.doesNotMatch(client, new RegExp(`^  function ${name}\\b`, "m"));
    assert.match(foundations, new RegExp(`export function ${name}\\b`));
  }
  assert.doesNotMatch(foundations, /\buseState\b|\buseEffect\b|\bfetch\s*\(|\bcreateClient\b/);
});

test("compose attachment normalization preserves valid uploaded references", () => {
  assert.deepEqual(
    serializeComposeAttachments([
      { bucket: " files ", path: "a/b.pdf", name: "", type: "application/pdf", size: 42 },
      { bucket: "", path: "ignored", name: "ignored", type: null, size: null },
    ] as any),
    [
      {
        bucket: "files",
        path: "a/b.pdf",
        name: "b.pdf",
        type: "application/pdf",
        size: 42,
      },
    ],
  );
  assert.deepEqual(
    normalizeCampaignAttachments(JSON.stringify([
      { bucket: "files", path: "x/y.png", filename: "image.png", mime_type: "image/png", size: "15" },
    ])),
    [
      { bucket: "files", path: "x/y.png", name: "image.png", type: "image/png", size: 15 },
    ],
  );
});

test("CRM department helpers keep metropolitan and overseas rules", () => {
  assert.equal(sanitizeCrmDepartmentFilter(" 2a- "), "2A");
  assert.equal(contactDepartment("75008"), "75");
  assert.equal(contactDepartment("97400"), "974");
});

test("campaign history helpers keep legacy routing contracts", () => {
  const item = {
    source: "mail_campaigns",
    module: "",
    folder: "offres",
    raw: { track_type: "promo_mail" },
  } as any;
  assert.deepEqual(inferTrackFromCampaign(item), {
    kind: "propulser",
    type: "promo_mail",
    payload: {},
  });
  assert.deepEqual(workflowDraftTargetFromSendItem(item, item.raw), {
    kind: "propulser",
    action: "promo",
    folder: "propulsions",
    trackType: "promo_mail",
  });
  assert.deepEqual(asScheduledRecord(["not", "a", "record"]), {});
  assert.deepEqual(asScheduledRecord({ ok: true }), { ok: true });
});
