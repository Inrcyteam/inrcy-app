import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const checks = [];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function check(label, condition, detail = "") {
  checks.push({ label, condition, detail });
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const requiredFiles = [
  "app/entreprises/[slug]/page.tsx",
  "app/entreprises/[slug]/loading.tsx",
  "app/entreprises/[slug]/not-found.tsx",
  "app/entreprises/[slug]/error.tsx",
  "app/entreprises/page.tsx",
  "app/metiers/page.tsx",
  "app/metiers/[metier]/page.tsx",
  "app/metiers/[metier]/[ville]/page.tsx",
  "app/secteurs/page.tsx",
  "app/secteurs/[secteur]/page.tsx",
  "app/api/inr-search/settings/route.ts",
  "app/api/inr-search/track/route.ts",
  "app/api/inr-search/analytics/route.ts",
  "app/api/inr-search/lead/route.ts",
  "app/entreprises/[slug]/InrSearchLeadForm.tsx",
  "lib/inrSearchPublic.ts",
  "lib/inrSearchSeo.ts",
  "lib/inrSearchQuality.ts",
  "lib/inrSearchProvisioning.ts",
  "lib/inrSearchEligibility.ts",
  "ops/sql/2026-07-11_app_bubble_access_inr_search.sql",
];

for (const file of requiredFiles) check(`Fichier requis : ${file}`, exists(file));

check("Anciennes routes OAuth Trustpilot supprimées", !exists("app/api/integrations/trustpilot"));
check("Anciennes routes avis Trustpilot supprimées", !exists("app/api/e-reputation/trustpilot"));
check("Anciennes bibliothèques Trustpilot supprimées", !exists("lib/trustpilotOAuth.ts") && !exists("lib/trustpilotReviews.ts"));

const publicPage = read("app/entreprises/[slug]/page.tsx");
const publicData = read("lib/inrSearchPublic.ts");
const analyticsLib = read("lib/inrSearchAnalytics.ts");
const leadApi = read("app/api/inr-search/lead/route.ts");
const leadForm = read("app/entreprises/[slug]/InrSearchLeadForm.tsx");
const settingsApi = read("app/api/inr-search/settings/route.ts");
const adminToolsApi = read("app/api/admin/tools/route.ts");
const trackingApi = read("app/api/inr-search/track/route.ts");
const provisioningLib = read("lib/inrSearchProvisioning.ts");
const eligibilityLib = read("lib/inrSearchEligibility.ts");
const settingsUi = read("app/dashboard/settings/_components/InrSearchSettingsContent.tsx");
const statsClient = read("app/dashboard/stats/StatsClient.tsx");
const seoLib = read("lib/inrSearchSeo.ts");
const templates = read("lib/messageTemplates.ts");
const sitemap = read("app/sitemap.ts");
const robots = read("app/robots.ts");
const bubbleAccessLib = read("lib/bubbleAccess.ts");
const bubbleAccessMigration = read("ops/sql/2026-07-11_app_bubble_access_inr_search.sql");

check("URL canonique entreprise conservée", publicPage.includes("buildInrSearchPublicUrl(data.slug)"));
check("Domaine public app.inrcy.com verrouillé", publicData.includes("https://app.inrcy.com") && !publicData.includes('|| "https://inrcy.com"'));
check("Clé interne iNr’Search unifiée", read("app/dashboard/dashboard.constants.ts").includes('key: "inr_search"') && !read("app/dashboard/dashboard.constants.ts").includes('key: "trustpilot"'));
check("Répertoires métier et secteur reliés", publicPage.includes("buildInrSearchProfessionUrl") && publicPage.includes("buildInrSearchSectorUrl"));
check("Données structurées sécurisées", publicPage.includes("safeJsonLd") && seoLib.includes("serializeInrSearchJsonLd"));
check("Rich results LocalBusiness présents", publicPage.includes('"@type": "LocalBusiness"'));
check("Fil d’Ariane structuré présent", publicPage.includes('"@type": "BreadcrumbList"'));
check("FAQ structurée conditionnelle présente", publicPage.includes('"@type": "FAQPage"'));
check("Métadonnées robots avancées présentes", publicPage.includes('"max-image-preview": "large"'));
check("Lien d’évitement clavier présent", publicPage.includes("skipLink") && publicPage.includes("contenu-principal"));
check("Score de qualité réservé à iNr’Stats", read("app/api/inr-search/analytics/route.ts").includes("loadInrSearchQuality") && !settingsApi.includes("loadInrSearchQuality"));
check("Protection taille payload analytics", trackingApi.includes("MAX_BODY_BYTES"));
check("Protection origine analytics", trackingApi.includes("sameOriginRequest"));
check("IndexNow branché", settingsApi.includes("ensureSystemManagedInrSearch") && provisioningLib.includes("submitInrSearchUrlsToIndexNow"));
check("Sitemap iNr’Search branché", sitemap.includes("listPublishedInrSearchCompanies"));
check("Robots autorise les pages publiques", robots.includes("/entreprises") || robots.includes("sitemap"));
check("QR Code iNr'Badge affiché sur la page publique", publicPage.includes("InrBadgeQr") && publicPage.includes("data.inrBadgeQrUrl"));
check("Lien public iNr'Badge généré automatiquement", publicData.includes("createInrBadgePublicUrl") && publicData.includes("createInrBadgeQrTrackingUrl"));
check("Publications Booster réelles utilisées", publicData.includes('.eq("module", "booster")') && publicData.includes('.eq("type", "publish")'));
check("Tentatives de publication échouées exclues", publicData.includes("hasLivePublicationChannel"));
check("Clics iNr'Badge suivis dans iNr'Stats", analyticsLib.includes('"inrbadge"') && publicPage.includes('data-inrsearch-action="inrbadge"'));
check("Formulaire de prospect iNr'Search affiché", publicPage.includes("InrSearchLeadForm") && leadForm.includes("Envoyer ma demande"));
check("Prospect iNr'Search ajouté au CRM", leadApi.includes("upsertCrmContactWithoutDuplicate") && leadApi.includes('source: "inr_search"'));
check("Prospect iNr'Search notifié au professionnel", leadApi.includes("notifications") && leadApi.includes("sendTxMail"));
check("Demandes formulaire remontées dans iNr'Stats", analyticsLib.includes('"lead_form"') && analyticsLib.includes("CONTACT_ACTION_KEYS"));
check("Template mail Trustpilot conservé", templates.includes('key: "booster_avis_trustpilot"'));
check("Publication limitée aux abonnements actifs", eligibilityLib.includes("hasActiveInrSearchSubscription") && eligibilityLib.includes('status === "active"') && eligibilityLib.includes('status !== "trialing"'));
check("Expiration de l’essai prise en compte", eligibilityLib.includes("trial_end_at") && eligibilityLib.includes("TRIAL_DURATION_DAYS"));
check("Accès iNr’Search administrable", eligibilityLib.includes('bubble_key", "inr_search"') && eligibilityLib.includes("buildBubbleAccessMap"));
check("iNr’Search activé par défaut", bubbleAccessLib.includes("inr_search: true"));
check("iNr’Search visible dans Bubble Access", adminToolsApi.includes("inr_search: { label: \"iNr'Search\""));
check("Migration Supabase iNr’Search fournie", bubbleAccessMigration.includes("'inr_search', true") && bubbleAccessMigration.includes("on conflict (user_id, bubble_key) do nothing"));
check("Pages publiques masquées si accès inéligible", publicData.includes("getInrSearchPublicationEligibility") && publicData.includes("if (!eligibility.allowed) return null"));
check("Annuaires filtrés selon l’éligibilité", publicData.includes("filterEligibleInrSearchAccountIds") && publicData.includes("eligibleConfigs"));
check("Tracking et formulaire bloqués si page retirée", analyticsLib.includes("getInrSearchPublicationEligibility") && analyticsLib.includes("eligibility.allowed"));
check("État réel de publication affiché au professionnel", settingsApi.includes("getInrSearchPublicStatus") && settingsUi.includes("publicationMessage") && settingsUi.includes("isPublished"));
check("Statistiques uniquement dans iNr’Stats", statsClient.includes('key: "inr_search"') && !settingsUi.includes("/api/inr-search/analytics"));
check("Chargements publics dédupliqués par requête", publicData.includes('import { cache } from "react"') && publicData.includes("cache(loadInrSearchPublicPageUncached)") && publicData.includes("cache(listPublishedInrSearchCompaniesUncached)"));
check("Masquage administrateur répercuté immédiatement", adminToolsApi.includes("revalidateInrSearchPublicRoutes") && provisioningLib.includes('revalidatePath("/entreprises/[slug]", "page")'));

for (const result of checks) {
  console.log(`${result.condition ? "✓" : "✗"} ${result.label}`);
}

if (failures.length) {
  console.error(`\nQA iNr'Search en échec (${failures.length}) :`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`\nQA iNr'Search validée : ${checks.length} contrôles réussis.`);
