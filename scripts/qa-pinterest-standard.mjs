import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];

function check(name, condition, hint) {
  checks.push({ name, ok: Boolean(condition), hint });
}

const oauth = read("lib/pinterestOAuth.ts");
const start = read("app/api/integrations/pinterest/start/route.ts");
const callback = read("app/api/integrations/pinterest/callback/route.ts");
const status = read("app/api/integrations/pinterest/status/route.ts");
const boards = read("app/api/integrations/pinterest/boards/route.ts");
const boardById = read(
  "app/api/integrations/pinterest/boards/[boardId]/route.ts",
);
const settings = read(
  "app/dashboard/settings/_components/PinterestSettingsContent.tsx",
);
const publish = read("app/api/booster/publish-now/route.ts");
const publishModal = read("app/dashboard/booster/publier/PublishModal.tsx");
const inrsend = read("lib/inrsend/publicationChannelActions.ts");
const analytics = read("lib/pinterestAnalytics.ts");
const stats = read("lib/stats/buildOverview.ts");
const connectedChannels = read("app/api/booster/connected-channels/route.ts");
const privacy = read("app/legal/_components/ConfidentialiteContent.tsx");

for (const scope of [
  "user_accounts:read",
  "boards:read",
  "boards:write",
  "pins:read",
  "pins:write",
]) {
  check(
    `scope ${scope}`,
    oauth.includes(scope),
    "Scope manquant dans le fallback OAuth Pinterest.",
  );
}

check(
  "OAuth state anti-CSRF",
  start.includes('makeOAuthState("pinterest"') &&
    start.includes("state: stateB64"),
  "Le flux OAuth doit conserver state.",
);
check(
  "OAuth Authorization Code",
  start.includes('response_type: "code"') &&
    callback.includes("exchangePinterestAuthorizationCode"),
  "Flux Authorization Code incomplet.",
);
check(
  "Tokens chiffrés",
  callback.includes("encryptToken(accessToken)") &&
    callback.includes("encryptToken(token.refresh_token)"),
  "Jetons Pinterest non chiffrés.",
);
check(
  "Callback sans copie profil API",
  !callback.includes("fetchPinterestUserAccount") &&
    !callback.includes("account.profileUrl") &&
    !callback.includes("account.username"),
  "Le callback ne doit pas persister le profil Pinterest.",
);
check(
  "Profil lu en direct",
  status.includes("fetchPinterestUserAccount(accessToken)"),
  "Le statut Pinterest doit relire le profil en direct.",
);
check(
  "Tableaux lus en direct",
  boards.includes("fetchPinterestBoards(accessToken)") &&
    settings.includes("/api/integrations/pinterest/boards"),
  "Les tableaux doivent être lus via API sans bloquer le statut local.",
);
check(
  "CRUD tableaux",
  boards.includes("createPinterestBoard") &&
    boardById.includes("updatePinterestBoard") &&
    boardById.includes("deletePinterestBoard"),
  "CRUD tableaux incomplet.",
);
check(
  "Tableau par défaut iNrCy",
  settings.includes("defaultBoardId") &&
    settings.includes("Définir par défaut"),
  "La configuration doit proposer un tableau par défaut.",
);
check(
  "Pas de nom de tableau par défaut persistant",
  !settings.includes("defaultBoardName"),
  "Le nom du tableau doit rester lu en direct depuis Pinterest.",
);
check(
  "Environnement Sandbox/Production",
  oauth.includes("PINTEREST_API_ENV") &&
    oauth.includes("api-sandbox.pinterest.com"),
  "Le routage Trial Sandbox doit être configurable.",
);
check(
  "Pinterest connecté sans board imposé",
  !connectedChannels.match(/pinterest:[^\n]*default_board_id/),
  "La connexion Pinterest ne doit pas dépendre d'un ancien tableau par défaut.",
);
check(
  "Choix board par publication",
  publish.includes("requestedPinterestBoardId") &&
    publish.includes("Choisissez un tableau Pinterest avant de publier"),
  "Booster doit exiger le tableau de cette publication.",
);
check(
  "Boards Booster lus via endpoint live",
  publishModal.includes('/api/integrations/pinterest/boards') &&
    !publishModal.includes('fetch("/api/integrations/pinterest/status", {\n        cache: "no-store" as any,\n      });\n      const result'),
  "Booster doit lire les tableaux via /boards et non via /status.",
);
check(
  "Création Pin réelle",
  publish.includes("createPinterestImagePin"),
  "Création de Pin absente.",
);
check(
  "Modification Pin réelle",
  inrsend.includes("updatePinterestPin") &&
    inrsend.includes('channel === "pinterest"'),
  "Modification Pinterest absente.",
);
check(
  "Suppression Pin réelle",
  inrsend.includes("deletePinterestPin"),
  "Suppression Pinterest absente.",
);
check(
  "Analytics live",
  analytics.includes("/user_account/analytics?") &&
    analytics.includes("IMPRESSION") &&
    analytics.includes("OUTBOUND_CLICK"),
  "Analytics Pinterest non branchées.",
);
check(
  "Analytics hors cache durable",
  stats.includes("stripPinterestApiMetricsFromPayload") &&
    stats.includes("hydratePinterestMetricsOnPayload"),
  "Les métriques Pinterest doivent être retirées du cache puis relues en direct.",
);
check(
  "Privacy Pinterest live",
  privacy.includes(
    "ne sont pas conservées durablement comme copie de la donnée Pinterest",
  ) && privacy.includes("action explicite de l’utilisateur"),
  "Politique Pinterest non alignée avec le flux réel.",
);
check(
  "SQL nettoyage historique",
  fs.existsSync(
    path.join(
      root,
      "ops/sql/2026-07-08_pinterest_standard_compliance_cleanup.sql",
    ),
  ),
  "Migration de nettoyage manquante.",
);

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  console.log(
    `${item.ok ? "✅" : "❌"} ${item.name}${item.ok ? "" : ` — ${item.hint}`}`,
  );
}

if (failed.length) {
  console.error(
    `\n[pinterest-standard] ${failed.length} contrôle(s) en échec.`,
  );
  process.exit(1);
}

console.log(
  `\n[pinterest-standard] OK — ${checks.length}/${checks.length} contrôles.`,
);
