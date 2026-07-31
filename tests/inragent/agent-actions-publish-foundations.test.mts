import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const route = read("app/api/agent/actions/route.ts");
const foundations = read("app/api/agent/actions/actionPublishDraft.foundations.ts");

test("la route iNrAgent délègue la normalisation des brouillons Booster", () => {
  assert.match(route, /from "\.\/actionPublishDraft\.foundations"/);
  assert.doesNotMatch(route, /^type PublishChannelKey =/m);
  assert.doesNotMatch(route, /^function cleanPublishMedia/m);
  assert.doesNotMatch(route, /^function cleanBoosterPost/m);
  assert.match(foundations, /export type PublishChannelKey =/);
  assert.match(foundations, /export function cleanPublishMedia/);
  assert.match(foundations, /export function buildPublishMediaReadiness/);
  assert.match(foundations, /export function buildPublishMediaAdaptation/);
  assert.match(foundations, /export function cleanBoosterPost/);
  assert.match(foundations, /INR_MEDIA_IMAGE_MAX_BYTES/);
  assert.match(foundations, /INR_MEDIA_VIDEO_SOURCE_MAX_BYTES/);
});

test("les accès réseau et le stockage restent dans la route", () => {
  assert.match(route, /async function readAgentMediaBuffer/);
  assert.match(route, /async function copyAgentMediaToBoosterDraft/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PATCH/);
  assert.doesNotMatch(foundations, /supabaseAdmin/);
  assert.doesNotMatch(foundations, /NextResponse/);
  assert.doesNotMatch(foundations, /fetch\(/);
});
