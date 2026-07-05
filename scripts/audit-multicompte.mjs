#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_ROOTS = ["app", "lib", "ops", "scripts", "tests"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".sql"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "vendor", "docs"]);
const SELF = path.normalize("scripts/audit-multicompte.mjs");

const PATTERNS = [
  { key: "user_id", label: "Références user_id", regex: /\buser_id\b/g },
  { key: "auth_uid", label: "Appels SQL auth.uid()", regex: /auth\.uid\(\)/g },
  { key: "user_id_auth_uid", label: "Comparaisons user_id = auth.uid()", regex: /(?:\buser_id\b\s*=\s*auth\.uid\(\)|auth\.uid\(\)\s*=\s*\buser_id\b)/g },
  { key: "fk_auth_users", label: "FK SQL vers auth.users", regex: /references\s+auth\.users/gi },
  { key: "get_user", label: "Appels Supabase auth.getUser()", regex: /\.auth\.getUser\(/g },
  { key: "user_dot_id", label: "Références user.id", regex: /\buser\.id\b/g },
  { key: "eq_user_id_user_id", label: ".eq('user_id', user.id)", regex: /\.eq\(\s*["']user_id["']\s*,\s*user\.id\s*\)/g },
  { key: "insert_user_id_user_id", label: "Payload user_id: user.id", regex: /\buser_id\s*:\s*user\.id\b/g },
];

async function walk(relativeDir) {
  const absoluteDir = path.join(ROOT, relativeDir);
  let entries;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...(await walk(relativePath)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (path.normalize(relativePath) === SELF) continue;
    if (!EXTENSIONS.has(path.extname(entry.name))) continue;
    files.push(relativePath);
  }
  return files;
}

function countMatches(text, regex) {
  regex.lastIndex = 0;
  let count = 0;
  while (regex.exec(text) !== null) count += 1;
  regex.lastIndex = 0;
  return count;
}

const files = (await Promise.all(SCAN_ROOTS.map(walk))).flat().sort();
const totals = Object.fromEntries(PATTERNS.map(({ key }) => [key, 0]));
const perFile = [];

for (const relativePath of files) {
  const text = await readFile(path.join(ROOT, relativePath), "utf8");
  const counts = {};
  let relevant = false;

  for (const pattern of PATTERNS) {
    const count = countMatches(text, pattern.regex);
    counts[pattern.key] = count;
    totals[pattern.key] += count;
    if (count > 0) relevant = true;
  }

  if (relevant) perFile.push({ file: relativePath.replaceAll(path.sep, "/"), counts });
}

const riskScore = (entry) =>
  entry.counts.user_id_auth_uid * 10 +
  entry.counts.eq_user_id_user_id * 8 +
  entry.counts.insert_user_id_user_id * 8 +
  entry.counts.fk_auth_users * 7 +
  entry.counts.user_dot_id * 2 +
  entry.counts.get_user;

const hotspots = perFile
  .map((entry) => ({ ...entry, score: riskScore(entry) }))
  .filter((entry) => entry.score > 0)
  .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
  .slice(0, 30);

console.log("\nAudit multicompte iNrCy — séparation AUTH / user_id métier\n");
for (const pattern of PATTERNS) {
  console.log(`${pattern.label.padEnd(38)} ${String(totals[pattern.key]).padStart(6)}`);
}

console.log("\nTop 30 hotspots à traiter aux étapes suivantes\n");
for (const item of hotspots) {
  const details = [
    item.counts.user_id_auth_uid ? `RLS=${item.counts.user_id_auth_uid}` : null,
    item.counts.fk_auth_users ? `FK=${item.counts.fk_auth_users}` : null,
    item.counts.eq_user_id_user_id ? `eq=${item.counts.eq_user_id_user_id}` : null,
    item.counts.insert_user_id_user_id ? `payload=${item.counts.insert_user_id_user_id}` : null,
    item.counts.user_dot_id ? `user.id=${item.counts.user_dot_id}` : null,
    item.counts.get_user ? `getUser=${item.counts.get_user}` : null,
  ].filter(Boolean);
  console.log(`${String(item.score).padStart(4)}  ${item.file}  ${details.join(" ")}`);
}

console.log(`\nFichiers analysés : ${files.length}`);
console.log("Audit terminé. Aucun fichier applicatif n'a été modifié par ce script.\n");
