import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../app/dashboard/mails/_components/MailboxDetailsModal.tsx", import.meta.url),
  "utf8",
);

test("iNrSend details load the account or page URL for the active publication channel", () => {
  assert.match(source, /\/api\/booster\/connected-channels/);
  assert.match(source, /activeChannelAccountHref/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /Ouvrir le compte|Ouvrir la page|Ouvrir la fiche|Ouvrir la chaîne/);
});

test("iNrSend details expose and refresh the live status of each selected channel", () => {
  assert.match(source, /\/api\/booster\/publications\/\$\{encodeURIComponent\(requestedPublicationId\)\}\/status/);
  assert.match(source, /Statut : <b>\{activePublicationStatusMeta\.label\}<\/b>/);
  assert.match(source, /Actualiser le statut/);
  assert.match(source, /shouldPollPublicationStatus/);
});
