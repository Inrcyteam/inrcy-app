export type BoutiqueProduct = {
  key: string;
  title: string;
  desc: string;
  priceEur: number;
  comboEur: number;
  priceUi: number;
  badge?: string;
};

// ✅ Source of truth (client + server)
export const BOUTIQUE_PRODUCTS: BoutiqueProduct[] = [
  {
    key: "cartes_visite",
    title: "Cartes de visite premium",
    desc: "Création design pro + impression sur papier de qualité + livraison.",
    priceEur: 359,
    comboEur: 215,
    priceUi: 7200,
    badge: "Print",
  },
  {
    key: "flyers",
    title: "Flyers professionnels",
    desc: "Création design + impression + livraison pour 1000 flyers.",
    priceEur: 420,
    comboEur: 252,
    priceUi: 8400,
    badge: "Print",
  },
  {
    key: "facebook_page",
    title: "Création page Facebook",
    desc: "Page professionnelle prête à valoriser votre activité.",
    priceEur: 420,
    comboEur: 252,
    priceUi: 8400,
    badge: "Social",
  },
  {
    key: "instagram_page",
    title: "Création page Instagram",
    desc: "Profil professionnel optimisé pour renforcer votre image.",
    priceEur: 420,
    comboEur: 252,
    priceUi: 8400,
    badge: "Social",
  },
  {
    key: "linkedin_page",
    title: "Création page LinkedIn",
    desc: "Page entreprise professionnelle et crédible.",
    priceEur: 469,
    comboEur: 281,
    priceUi: 9400,
    badge: "Social",
  },
  {
    key: "gmb",
    title: "Optimisation Google Business",
    desc: "Fiche optimisée pour renforcer votre visibilité locale.",
    priceEur: 299,
    comboEur: 179,
    priceUi: 6000,
    badge: "Local",
  },
  {
    key: "logo",
    title: "Logo professionnel",
    desc: "Création graphique complète avec déclinaisons exploitables.",
    priceEur: 599,
    comboEur: 359,
    priceUi: 12000,
    badge: "Branding",
  },
  {
    key: "ads",
    title: "Campagne publicitaire",
    desc: "Configuration complète de votre campagne d'acquisition.",
    priceEur: 719,
    comboEur: 431,
    priceUi: 14400,
    badge: "Acquisition",
  },
  {
    key: "site_refonte",
    title: "Refonte site internet",
    desc: "Refonte premium pour moderniser votre présence en ligne.",
    priceEur: 1799,
    comboEur: 1079,
    priceUi: 26000,
    badge: "Web",
  },
  {
    key: "site_creation",
    title: "Création site internet",
    desc: "Site professionnel haut de gamme conçu pour convertir.",
    priceEur: 2990,
    comboEur: 1794,
    priceUi: 33000,
    badge: "Web",
  },
]
  .slice()
  .sort((a, b) => a.priceEur - b.priceEur);

export function findBoutiqueProduct(key: string) {
  return BOUTIQUE_PRODUCTS.find((p) => p.key === key) ?? null;
}
