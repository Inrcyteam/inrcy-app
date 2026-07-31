import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync("app/dashboard/mails/MailboxClient.tsx", "utf8");
const foundations = readFileSync(
  "app/dashboard/mails/_lib/mailboxPublicationVideo.foundations.ts",
  "utf8",
);

test("MailboxClient delegates publication video foundations without moving React orchestration", () => {
  assert.match(client, /from "\.\/_lib\/mailboxPublicationVideo\.foundations"/);
  assert.match(foundations, /export type PublicationEditVideoState/);
  assert.match(foundations, /export type CampaignDistributionNotice/);
  assert.match(foundations, /export function normalizeBoosterChannelKeyForVideo/);
  assert.match(foundations, /export function attachmentToVideoPayload/);
  assert.match(foundations, /export function readPublicationVideoMetadata/);
  assert.doesNotMatch(foundations, /\buseState\b|\buseEffect\b|\bfetch\s*\(|\bcreateClient\b/);
  assert.doesNotMatch(foundations, /from "\.\.\/MailboxClient"|from "\.\.\/\.\.\/mails\/MailboxClient"/);
  assert.doesNotMatch(client, /type PublicationEditVideoState =/);
  assert.doesNotMatch(client, /function attachmentToVideoPayload/);
  assert.doesNotMatch(client, /function readPublicationVideoMetadata/);
});

test("the component still owns all calls and state using the extracted helpers", () => {
  assert.match(client, /useState<Record<string, PublicationEditVideoState>>/);
  assert.match(client, /useState<CampaignDistributionNotice \| null>/);
  assert.match(client, /attachmentToVideoPayload\(videoCandidate\)/);
  assert.match(client, /readPublicationVideoMetadata\(file, previewUrl\)/);
  assert.match(client, /normalizeBoosterChannelKeyForVideo\(channel/);
});
