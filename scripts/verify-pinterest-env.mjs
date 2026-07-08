/*
 * Vérification dédiée de la configuration Pinterest iNrCy.
 * Ne journalise jamais les valeurs secrètes.
 */

const required = [
  "PINTEREST_CLIENT_ID",
  "PINTEREST_CLIENT_SECRET",
  "PINTEREST_REDIRECT_URI",
  "PINTEREST_OAUTH_SCOPES",
  "PINTEREST_API_ENV",
  "NEXT_PUBLIC_APP_URL",
  "INRCY_CREDENTIALS_SECRET",
];

const expectedScopes = new Set([
  "user_accounts:read",
  "boards:read",
  "boards:write",
  "pins:read",
  "pins:write",
]);

function value(key) {
  return String(process.env[key] || "").trim();
}

const missing = required.filter((key) => !value(key));

if (missing.length) {
  console.error("[pinterest-env] Variables manquantes:");
  for (const key of missing) console.error(`  - ${key}`);
  process.exit(1);
}

let redirect;
try {
  redirect = new URL(value("PINTEREST_REDIRECT_URI"));
} catch {
  console.error(
    "[pinterest-env] PINTEREST_REDIRECT_URI n'est pas une URL valide.",
  );
  process.exit(1);
}

if (redirect.protocol !== "https:") {
  console.error(
    "[pinterest-env] PINTEREST_REDIRECT_URI doit utiliser HTTPS en production.",
  );
  process.exit(1);
}

if (redirect.pathname !== "/api/integrations/pinterest/callback") {
  console.error(
    "[pinterest-env] Le chemin de callback Pinterest est incorrect.",
  );
  console.error("  Attendu: /api/integrations/pinterest/callback");
  process.exit(1);
}

const appOrigin = new URL(value("NEXT_PUBLIC_APP_URL")).origin;
if (redirect.origin !== appOrigin) {
  console.error(
    "[pinterest-env] L'origine du callback Pinterest doit correspondre à NEXT_PUBLIC_APP_URL.",
  );
  process.exit(1);
}

const apiEnvironment = value("PINTEREST_API_ENV").toLowerCase();
if (!["sandbox", "production"].includes(apiEnvironment)) {
  console.error(
    "[pinterest-env] PINTEREST_API_ENV doit valoir sandbox ou production.",
  );
  process.exit(1);
}

const scopes = new Set(
  value("PINTEREST_OAUTH_SCOPES")
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean),
);

const missingScopes = [...expectedScopes].filter((scope) => !scopes.has(scope));
if (missingScopes.length) {
  console.error("[pinterest-env] Scopes Pinterest manquants:");
  for (const scope of missingScopes) console.error(`  - ${scope}`);
  process.exit(1);
}

console.log("[pinterest-env] OK");
console.log(`  App origin: ${appOrigin}`);
console.log(`  Redirect path: ${redirect.pathname}`);
console.log(`  API environment: ${apiEnvironment}`);
console.log(`  Scopes: ${[...scopes].join(",")}`);
