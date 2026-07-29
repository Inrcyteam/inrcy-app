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
const pinterestPublish = read("lib/pinterestPublish.ts");
const pinterestVideoProtocol = read("lib/pinterestVideoProtocol.ts");
const pinterestImagePayload = read("lib/pinterestImagePinPayload.ts");
const publishRules = read("app/dashboard/booster/publier/publishModal.shared.tsx");
const inrsendDetails = read("app/dashboard/mails/_components/MailboxDetailsModal.tsx");
const bubbleAccess = read("lib/bubbleAccess.ts");
const pinterestAccessMigration = read(
  "ops/sql/2026-07-27_app_bubble_access_pinterest_enabled.sql",
);
const pinterestProductionCutover = read(
  "ops/sql/2026-07-27_pinterest_production_cutover.sql",
);
const settingsDrawer = read(
  "app/dashboard/_components/DashboardSettingsDrawerContent.tsx",
);
const agentExecute = read("app/api/agent/actions/execute/route.ts");
const agentSchedule = read("app/api/agent/actions/schedule/route.ts");
const vercelConfig = JSON.parse(read("vercel.json"));

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
  "Environnement Pinterest production uniquement",
  oauth.includes('return "https://api.pinterest.com"') &&
    !oauth.includes("api-sandbox.pinterest.com"),
  "L'intégration Pinterest officielle ne doit plus router vers le Sandbox.",
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
  "Création Pins image et vidéo réelle",
  publish.includes("createPinterestImagePin") &&
    publish.includes("createPinterestVideoPin") &&
    pinterestPublish.includes("publishPinterestVideoWithProtocol"),
  "La création Pinterest doit couvrir les images et les vidéos.",
);
check(
  "Booster autorise Pinterest en vidéo",
  !publishModal.includes(
    'if (channel === "pinterest") return hasImages ? "images" : "none"',
  ) &&
    publishModal.includes('pinterestMode === "video" && !videoFile') &&
    publishRules.includes('channel === "pinterest" && hasVideo'),
  "Le sélecteur Booster ne doit plus forcer Pinterest en mode image.",
);
check(
  "iNrAgent conserve Pinterest en vidéo",
  agentExecute.includes('if (activeMediaMode === "video") return true;') &&
    agentSchedule.includes('if (activeMediaMode === "video") return true;'),
  "Les publications immédiates et programmées iNrAgent doivent garder Pinterest en mode vidéo.",
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
  "Fallback édition production",
  inrsend.includes("pinterest_pin_replaced") &&
    inrsend.includes("isPinterestPinEditRestrictedError") &&
    pinterestPublish.includes("pin_edit"),
  "Le fallback de remplacement production pour pin_edit manque.",
);
check(
  "Protocole Video Pin complet",
  pinterestVideoProtocol.includes('"/media"') &&
    pinterestVideoProtocol.includes("new FormData") &&
    pinterestVideoProtocol.includes("upload_parameters") &&
    pinterestVideoProtocol.includes("/media/${encodeURIComponent(mediaId)}") &&
    pinterestVideoProtocol.includes('source_type: "video_id"') &&
    pinterestVideoProtocol.includes("cover_image_url"),
  "Le flux register/upload/poll/create des Video Pins est incomplet.",
);
check(
  "Couverture vidéo automatique",
  pinterestPublish.includes("pinterest-video-covers") &&
    pinterestPublish.includes("pinterest-cover.jpg") &&
    pinterestPublish.includes("createPinterestVideoPin"),
  "Pinterest doit disposer d'une couverture publique même sans miniature fournie.",
);
check(
  "FFmpeg embarqué pour les routes Pinterest",
  [
    "app/api/booster/publish-now/route.ts",
    "app/api/inrsend/publications/[publicationId]/pinterest/route.ts",
  ].every(
    (route) =>
      vercelConfig.functions?.[route]?.includeFiles ===
      "node_modules/ffmpeg-static/**/*",
  ),
  "Vercel doit embarquer FFmpeg dans les routes qui génèrent les couvertures Pinterest.",
);
check(
  "Pas de perte silencieuse multi-images",
  publish.includes("imageUrls: pinterestImageUrls") &&
    publish.includes("limit: 5") &&
    pinterestPublish.includes("buildPinterestImageMediaSource(requestedImageUrls)") &&
    pinterestImagePayload.includes('source_type: "multiple_image_urls"'),
  "Pinterest doit transmettre réellement les 2 à 5 images au payload multiple_image_urls.",
);
check(
  "Erreurs publication non mappées en erreur mail",
  inrsendDetails.includes('detailsItem.source === "app_events"') &&
    inrsendDetails.includes("? detailsActionError"),
  "iNrSend ne doit pas transformer une erreur Pinterest en erreur de boîte mail.",
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
  "Pinterest actif par défaut",
  /pinterest:\s*true/.test(bubbleAccess),
  "APP_BUBBLE_DEFAULT_ACCESS doit activer Pinterest pour les nouveaux comptes.",
);
check(
  "Fallback panneau Pinterest actif",
  settingsDrawer.includes("pinterestAccessEnabled = true"),
  "Le fallback du panneau Pinterest doit suivre le statut Standard.",
);
check(
  "Migration activation Pinterest",
  pinterestAccessMigration.includes("select account.id, 'pinterest', true") &&
    pinterestAccessMigration.includes("(new.id, 'pinterest', true)") &&
    pinterestAccessMigration.includes("(new.id, 'site_inrcy', false)"),
  "La migration doit activer Pinterest existant/futur sans ouvrir Site iNrCy.",
);
check(
  "Bascule des anciens jetons Sandbox",
  pinterestProductionCutover.includes("pinterest_api_environment") &&
    pinterestProductionCutover.includes("= 'sandbox'") &&
    pinterestProductionCutover.includes("status = 'disconnected'") &&
    pinterestProductionCutover.includes("access_token_enc = null"),
  "Les anciennes connexions Sandbox explicites doivent demander une reconnexion Production.",
);
check(
  "Code Pinterest sans Sandbox",
  !oauth.includes("api-sandbox.pinterest.com") &&
    !publishRules.includes("Sandbox Pinterest") &&
    !publish.includes("Sandbox Pinterest") &&
    !inrsend.includes("Sandbox Pinterest") &&
    !inrsend.includes("pinterest_sandbox"),
  "Le code Pinterest officiel ne doit plus contenir de chemin ou message Sandbox.",
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
