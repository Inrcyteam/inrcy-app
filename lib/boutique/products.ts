export type BoutiqueProduct = {
  key: string;
  title: string;
  desc: string;
  priceEur: number;
  priceUi: number;
  badge?: string;
};

// ✅ Source of truth (client + server)
export const BOUTIQUE_PRODUCTS: BoutiqueProduct[] = [
  {
    key: "cartes_visite",
    title: "Cartes de visite",
    desc: "Design pro + fichiers prêts à imprimer.",
    priceEur: 59,
    priceUi: 590,
    badge: "Print",
  },
  {
    key: "flyers",
    title: "Flyers",
    desc: "Flyer A5/A6 : design + export HD.",
    priceEur: 79,
    priceUi: 790,
    badge: "Print",
  },
  {
    key: "facebook_page",
    title: "Création page Facebook",
    desc: "Page + visuels + réglages essentiels.",
    priceEur: 89,
    priceUi: 890,
    badge: "Social",
  },
  {
    key: "instagram_page",
    title: "Création page Instagram",
    desc: "Compte pro + bio + visuels + highlights.",
    priceEur: 89,
    priceUi: 890,
    badge: "Social",
  },
  {
    key: "linkedin_page",
    title: "Création page LinkedIn",
    desc: "Page entreprise + branding + sections.",
    priceEur: 99,
    priceUi: 990,
    badge: "Social",
  },
  {
    key: "gmb",
    title: "Création Google Business",
    desc: "Fiche optimisée : catégories, description, services, photos.",
    priceEur: 129,
    priceUi: 1290,
    badge: "Local",
  },
  {
    key: "logo",
    title: "Logo",
    desc: "Logo simple + déclinaisons (clair/sombre).",
    priceEur: 149,
    priceUi: 1490,
    badge: "Branding",
  },
  {
    key: "ads",
    title: "Campagnes Ads",
    desc: "Set-up campagne + tracking + optimisation (budget pub non inclus).",
    priceEur: 290,
    priceUi: 2900,
    badge: "Acquisition",
  },
  {
    key: "site_refonte",
    title: "Refonte site internet",
    desc: "Modernisation + structure SEO + performance.",
    priceEur: 1500,
    priceUi: 15000,
    badge: "Web",
  },
  {
    key: "site_creation",
    title: "Création site internet",
    desc: "Site vitrine rapide, propre et optimisé (sur base iNrCy).",
    priceEur: 2500,
    priceUi: 25000,
    badge: "Web",
  },
]
  // ✅ ordre croissant (prix €)
  .slice()
  .sort((a, b) => a.priceEur - b.priceEur);

export function findBoutiqueProduct(key: string) {
  return BOUTIQUE_PRODUCTS.find((p) => p.key === key) ?? null;
}
