import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const client = read("app/dashboard/agent/AgentClient.tsx");
const foundations = read("app/dashboard/agent/_lib/agent.media-adapter.ts");

test("AgentClient délègue les helpers d'adaptation média", () => {
  assert.match(client, /from "\.\/_lib\/agent\.media-adapter"/);
  assert.doesNotMatch(client, /^function dataUrlToFile/m);
  assert.doesNotMatch(client, /^function offsetFromDrawPosition/m);
  assert.doesNotMatch(client, /^async function urlToFile/m);
  assert.match(foundations, /export function dataUrlToFile/);
  assert.match(foundations, /export function offsetFromDrawPosition/);
  assert.match(foundations, /export async function urlToFile/);
  assert.match(foundations, /import \{ clampNumber \} from "\.\/agent\.utils"/);
});
