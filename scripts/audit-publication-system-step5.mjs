import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const contract = read("lib/metaGraphApi.ts");
const files = [
  "lib/facebookPublish.ts",
  "lib/instagramPublish.ts",
  "lib/inrsend/publicationChannelActions.ts",
  "lib/metaBusinessAssets.ts",
  "lib/metaInsights.ts",
  "lib/facebookInsights.ts",
  "app/api/integrations/facebook/start/route.ts",
  "app/api/integrations/facebook/callback/route.ts",
  "app/api/integrations/instagram/start/route.ts",
  "app/api/integrations/instagram/callback/route.ts",
];
const sources = files.map((file) => [file, read(file)]);

const hardcoded = sources.filter(([, source]) =>
  /(?:graph|www)\.facebook\.com\/v\d+\.\d+/.test(source),
);
const localConstants = sources.filter(([, source]) =>
  /const\s+FACEBOOK_GRAPH_VERSION\s*=/.test(source),
);
const missingContract = sources.filter(([, source]) => !/metaGraphApi/.test(source));

const facebookInsights = read("lib/facebookInsights.ts");
const facebookOAuth = read("app/api/integrations/facebook/start/route.ts");
const facebookStatsUi = read("app/dashboard/stats/stats.shared.metrics.ts");

const checks = [
  [/META_GRAPH_API_DEFAULT_VERSION = "v25\.0"/.test(contract), "v25.0 par défaut"],
  [/process\.env\.META_GRAPH_API_VERSION/.test(contract), "rollback par variable serveur"],
  [/META_GRAPH_API_VERSION_PATTERN/.test(contract), "validation stricte du numéro de version"],
  [hardcoded.length === 0, "aucune URL Meta versionnée en dur"],
  [localConstants.length === 0, "aucune constante Meta locale divergente"],
  [missingContract.length === 0, "tous les parcours Meta utilisent le contrat central"],
  [/"page_media_view"/.test(facebookInsights) && /"page_total_media_view_unique"/.test(facebookInsights), "Page Insights utilise Media Views / Media Viewers"],
  [/"post_media_view"/.test(facebookInsights) && /"post_total_media_view_unique"/.test(facebookInsights), "Post Insights utilise Media Views / Media Viewers"],
  [!/"page_impressions"/.test(facebookInsights) && !/"post_impressions/.test(facebookInsights), "aucune ancienne métrique impressions n'est encore demandée à Meta"],
  [/read_insights/.test(facebookOAuth) && /pages_read_engagement/.test(facebookOAuth), "scopes Insights existants inchangés"],
  [/Spectateurs uniques/.test(facebookStatsUi) && /page_total_media_view_unique/.test(facebookStatsUi), "iNrStats affiche les nouvelles métriques"],
];

let failures = 0;
console.log("\n=== iNrCy Publication System - Étape 5 / Meta centralisé ===\n");
for (const [ok, label] of checks) {
  if (ok) console.log(`PASS  ${label}`);
  else {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}
if (hardcoded.length) console.error("URLs codées en dur:", hardcoded.map(([file]) => file));
if (localConstants.length) console.error("Constantes locales:", localConstants.map(([file]) => file));
if (missingContract.length) console.error("Contrat absent:", missingContract.map(([file]) => file));
console.log(`\nRésultat : ${checks.length - failures}/${checks.length} contrôles validés.`);
if (failures) process.exit(1);
