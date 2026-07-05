import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const errors = [];

function read(file) {
  return readFileSync(file, "utf8");
}

function rel(file) {
  return relative(root, file).replaceAll("\\", "/");
}

function integrationFiles(kind, marker) {
  const base = join(root, "app", "api", "integrations");
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(base, entry.name, kind, "route.ts"))
    .filter((file) => existsSync(file) && read(file).includes(marker));
}

for (const file of integrationFiles("start", "makeOAuthState")) {
  const source = read(file);
  if (!/makeOAuthState\([\s\S]*accountId/.test(source)) errors.push(`${rel(file)}: state OAuth sans accountId`);
  if (!source.includes("cookieValue")) errors.push(`${rel(file)}: cookie OAuth non lié au state complet`);
}

for (const file of integrationFiles("callback", "verifyOAuthState")) {
  const source = read(file);
  if (!source.includes("resolveOAuthBoundInrcyAccountId")) {
    errors.push(`${rel(file)}: callback OAuth non lié à l'établissement du state`);
  }
  if (source.includes("resolveActiveInrcyAccountId")) {
    errors.push(`${rel(file)}: callback OAuth dépend encore de l'établissement courant`);
  }
}

const server = read(join(root, "lib", "multicompte", "server.ts"));
if (!server.includes("INRCY_ACCOUNT_SCOPE_UNAVAILABLE") || !server.includes("INRCY_ACCOUNT_SCOPE_MISSING")) {
  errors.push("lib/multicompte/server.ts: résolution des comptes non fail-closed");
}

const requireUser = read(join(root, "lib", "requireUser.ts"));
if (!requireUser.includes("account_scope_unavailable") || !/status:\s*503/.test(requireUser)) {
  errors.push("lib/requireUser.ts: panne du scope non traitée en 503 contrôlée");
}

const tabSync = read(join(root, "app", "dashboard", "_components", "ActiveAccountTabSync.tsx"));
if (!tabSync.includes('addEventListener("storage"') || !tabSync.includes("purgeAllBrowserAccountCaches")) {
  errors.push("ActiveAccountTabSync.tsx: synchronisation multi-onglets incomplète");
}

// Garde-fou : les accès directs user_id = AUTH UID ne sont permis que dans les zones
// volontairement globales (abonnement, rôle AUTH, écrans Admin).
const directEqAllowlist = new Map([
  ["app/compte-bloque/page.tsx", 1],
  ["app/dashboard/layout.tsx", 1],
  ["app/dashboard/settings/_components/AbonnementContent.tsx", 3],
  ["app/dashboard/settings/_components/BoutiqueContent.tsx", 1],
  ["app/api/billing/uncancel/route.ts", 2],
  ["lib/roles.ts", 1],
]);
const directPayloadAllowlist = new Map([
  ["app/api/admin/tools/route.ts", 1],
  ["app/api/admin/users/route.ts", 1],
]);
const authUserIdAssignmentAllowlist = new Map([
  ["app/api/billing/cancel/route.ts", 1],
  ["app/api/billing/checkout/route.ts", 1],
  ["app/api/billing/portal/route.ts", 1],
]);

function sourceFiles(baseDir) {
  const out = [];
  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    const file = join(baseDir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(file));
    else if (/\.(?:ts|tsx|js|jsx|mjs|mts)$/.test(entry.name)) out.push(file);
  }
  return out;
}

const runtimeFiles = [join(root, "app"), join(root, "lib")].flatMap(sourceFiles);
const observedDirectEq = new Map();
const observedDirectPayload = new Map();
const observedAuthAssignment = new Map();
for (const file of runtimeFiles) {
  const source = read(file);
  const path = rel(file);
  const directEqCount = (source.match(/\.eq\(\s*["']user_id["']\s*,\s*user\.id\s*\)/g) || []).length;
  const directPayloadCount = (source.match(/user_id\s*:\s*user\.id\b/g) || []).length;
  const authAssignmentCount = (source.match(/\bconst\s+userId\s*=\s*user\.id\b/g) || []).length;
  if (directEqCount) observedDirectEq.set(path, directEqCount);
  if (directPayloadCount) observedDirectPayload.set(path, directPayloadCount);
  if (authAssignmentCount) observedAuthAssignment.set(path, authAssignmentCount);

  // Un getUser() client ne doit jamais redevenir directement un userId métier.
  if (/const\s+userId\s*=\s*auth\?\.user\?\.id\s*(?:\|\|\s*null)?\s*;/.test(source)) {
    errors.push(`${path}: userId métier encore dérivé directement de AUTH dans le navigateur`);
  }
}

function compareAllowlist(label, observed, allowed) {
  for (const [path, count] of observed) {
    if (allowed.get(path) !== count) errors.push(`${path}: ${label} non autorisé ou nombre inattendu (${count})`);
  }
  for (const [path, count] of allowed) {
    if ((observed.get(path) || 0) !== count) errors.push(`${path}: garde-fou ${label} attendu ${count}, trouvé ${observed.get(path) || 0}`);
  }
}

compareAllowlist("user_id = AUTH UID", observedDirectEq, directEqAllowlist);
compareAllowlist("payload user_id AUTH", observedDirectPayload, directPayloadAllowlist);
compareAllowlist("affectation userId AUTH", observedAuthAssignment, authUserIdAssignmentAllowlist);

if (errors.length) {
  console.error("QA multicompte finale: ECHEC");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("QA multicompte finale: OK");
