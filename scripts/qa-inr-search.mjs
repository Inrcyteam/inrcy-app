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
  "app/entreprises/[slug]/InrSearchExperience.tsx",
  "app/entreprises/[slug]/InrSearchNewsShowcase.tsx",
  "app/entreprises/[slug]/InrSearchServicesOrbit.tsx",
  "app/entreprises/[slug]/InrSearchGalleryOrbit.tsx",
  "app/entreprises/[slug]/InrSearchZoneOrbit.tsx",
  "app/entreprises/[slug]/InrSearchStrengthsOrbit.tsx",
  "app/entreprises/[slug]/InrSearchFaqOrbit.tsx",
  "app/entreprises/[slug]/InrSearchSocialOrbit.tsx",
  "app/entreprises/[slug]/InrSearchContactOrbit.tsx",
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
const publicNews = read("app/entreprises/[slug]/InrSearchNewsShowcase.tsx");
const publicExperience = read("app/entreprises/[slug]/InrSearchExperience.tsx");
const publicGallery = read("app/entreprises/[slug]/InrSearchGalleryOrbit.tsx");
const publicStrengths = read("app/entreprises/[slug]/InrSearchStrengthsOrbit.tsx");
const publicFaq = read("app/entreprises/[slug]/InrSearchFaqOrbit.tsx");
const publicSocials = read("app/entreprises/[slug]/InrSearchSocialOrbit.tsx");
const publicZone = read("app/entreprises/[slug]/InrSearchZoneOrbit.tsx");
const publicCss = read("app/entreprises/[slug]/inrSearchPublic.module.css");
const publicData = read("lib/inrSearchPublic.ts");
const analyticsLib = read("lib/inrSearchAnalytics.ts");
const leadApi = read("app/api/inr-search/lead/route.ts");
const leadForm = read("app/entreprises/[slug]/InrSearchLeadForm.tsx");
const contactOrbit = read("app/entreprises/[slug]/InrSearchContactOrbit.tsx");
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
check("Répertoires métier et secteur conservés hors navigation client", publicData.includes("buildInrSearchProfessionUrl") && publicData.includes("buildInrSearchSectorUrl"));
check("Données structurées sécurisées", publicPage.includes("safeJsonLd") && seoLib.includes("serializeInrSearchJsonLd"));
check("Rich results LocalBusiness présents", publicPage.includes('"@type": "LocalBusiness"'));
check("Fil d’Ariane structuré présent", publicPage.includes('"@type": "BreadcrumbList"'));
check("FAQ structurée conditionnelle présente", publicPage.includes('"@type": "FAQPage"'));
check("Métadonnées robots avancées présentes", publicPage.includes('"max-image-preview": "large"'));
check("Lien d’évitement clavier présent", publicPage.includes("skipLink") && publicPage.includes("#presentation"));
check("Score de qualité réservé à iNr’Stats", read("app/api/inr-search/analytics/route.ts").includes("loadInrSearchQuality") && !settingsApi.includes("loadInrSearchQuality"));
check("Protection taille payload analytics", trackingApi.includes("MAX_BODY_BYTES"));
check("Protection origine analytics", trackingApi.includes("sameOriginRequest"));
check("IndexNow branché", settingsApi.includes("ensureSystemManagedInrSearch") && provisioningLib.includes("submitInrSearchUrlsToIndexNow"));
check("Sitemap iNr’Search branché", sitemap.includes("listPublishedInrSearchCompanies"));
check("Robots autorise les pages publiques", robots.includes("/entreprises") || robots.includes("sitemap"));
check("QR Code iNr'Badge affiché dans la scène Confiance", publicPage.includes("inrBadgeQrUrl={data.inrBadgeQrUrl}") && publicStrengths.includes("InrBadgeQr"));
check("Lien public iNr'Badge généré automatiquement", publicData.includes("createInrBadgePublicUrl") && publicData.includes("createInrBadgeQrTrackingUrl"));
check("Publications Booster réelles utilisées", publicData.includes('.eq("module", "booster")') && publicData.includes('.eq("type", "publish")'));
check("Tentatives de publication échouées exclues", publicData.includes("hasLivePublicationChannel"));
check("Clics iNr'Badge suivis dans iNr'Stats", analyticsLib.includes('"inrbadge"') && publicStrengths.includes('data-inrsearch-action="inrbadge"'));
check("Formulaire de prospect iNr'Search affiché", publicPage.includes("InrSearchContactOrbit") && contactOrbit.includes("InrSearchLeadForm") && leadForm.includes("Envoyer ma demande"));
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
check("Résumé factuel visible pour les moteurs", publicPage.includes("buildFactualSummary") && publicPage.includes("Présentation"));
check("Prestations enrichies par un contexte lisible", publicPage.includes("buildServiceDescription") && publicPage.includes("serviceCard > p") === false);
check("Actualités iNr’Search structurées en BlogPosting", publicPage.includes('"@type": "BlogPosting"') && publicNews.includes("L’entreprise en mouvement"));
check("iNrBadge possède une scène Confiance dédiée sans duplication dans le hero", publicPage.includes("InrSearchStrengthsOrbit") && publicStrengths.includes("strengthBadgeCard") && !publicPage.includes("presentationOrbQr"));
check("Navigation publique centrée sur l’entreprise", publicPage.includes("InrSearchExperience") && !publicPage.includes('href="/entreprises"') && !publicPage.includes('href="/metiers"') && !publicPage.includes('href="/secteurs"'));
check("Navigation par ancres de rubrique", publicPage.includes('#presentation') && publicPage.includes('#prestations') && publicPage.includes('#realisations') && publicPage.includes('#actualites') && publicPage.includes('#contact'));
check("Aucun discours technique visible pour l’internaute", !publicPage.includes("moteurs de recherche et les IA") && !publicPage.includes("Page professionnelle iNr&apos;Search") && !publicPage.includes("Propulsé par"));
check("Actualités limitées aux publications iNr’Search", publicData.includes("hasLivePublicationChannel") && publicData.includes("byChannel.inr_search") && publicData.includes("publications.length >= 10"));
check("Prévisualisation locale sans build Vercel", settingsUi.includes('href={previewUrl}') && settingsUi.includes('/entreprises/${settings.slug}'));

check("Architecture orbitale rendue côté serveur", publicPage.includes("data-orbit-section") && !publicPage.includes("activeSection ==="));
check("Toutes les rubriques orbitales restent dans le HTML", publicPage.includes("InrSearchServicesOrbit") && publicPage.includes("InrSearchGalleryOrbit") && publicPage.includes("InrSearchFaqOrbit"));
check("Navigation orbitale accessible au clavier", publicExperience.includes('aria-current={active === item.href ? "location"') && publicExperience.includes("ArrowRight") && publicExperience.includes("PageDown"));
check("Focus des rubriques orbitales géré", (publicPage.match(/tabIndex=\{-1\}/g) || []).length >= 8 && publicExperience.includes("target.focus({ preventScroll: true })"));
check("Rubriques inactives neutralisées sans être retirées du DOM", publicExperience.includes('setAttribute("inert", "")') && publicExperience.includes('setAttribute("aria-hidden"'));
check("Animations respectent la réduction des mouvements", publicExperience.includes("prefers-reduced-motion: reduce") && publicCss.includes("@media (prefers-reduced-motion: reduce)"));
check("Version imprimable verticale disponible", publicCss.includes("@media print") && publicCss.includes(".orbitViewport") && publicCss.includes("display: block !important"));
check("Mode contraste forcé pris en charge", publicCss.includes("@media (forced-colors: active)"));
check("Modales restaurent le focus", publicNews.includes("returnFocusRef") && publicGallery.includes("returnFocusRef") && publicNews.includes("closeButtonRef") && publicGallery.includes("closeButtonRef"));
check("Métadonnées publiques centrées sur l’entreprise", publicPage.includes("const title = data.pageTitle") && publicPage.includes("siteName: data.companyName"));
check("Prestations structurées avec description et fournisseur", publicPage.includes("serviceType: service") && publicPage.includes("description: buildServiceDescription(service, data)") && publicPage.includes('provider: { "@id"'));
check("Actualités structurées avec URL d’ancrage", publicPage.includes("#actualite-${index + 1}") && publicNews.includes('id={`actualite-${index + 1}`}'));
check("Sections décrites comme éléments de page", publicPage.includes('"@type": "WebPageElement"') && publicPage.includes("hasPart:"));
check("Aide de navigation invisible mais disponible", publicPage.includes("orbit-instructions") && publicCss.includes(".visuallyHidden"));
check("FAQ plein écran à trois cartes", publicFaq.includes("faqCarousel") && publicFaq.includes('position: "previous"') && publicFaq.includes('position: "next"'));
check("Réseaux animés comme un système solaire complet", publicSocials.includes("socialOrbitTrack") && publicSocials.includes("--social-speed") && publicSocials.includes("links.map"));
check("Radar réservé à la Zone", publicZone.includes("zoneOrbitRadar") && !contactOrbit.includes("contactConvergenceField"));
check("Actualités visibles même avant la première publication", publicPage.includes("data.sections.news ?") && publicNews.includes("newsOrbitEmpty"));

for (const result of checks) {
  console.log(`${result.condition ? "✓" : "✗"} ${result.label}`);
}

if (failures.length) {
  console.error(`\nQA iNr'Search en échec (${failures.length}) :`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`\nQA iNr'Search validée : ${checks.length} contrôles réussis.`);
