export const ACTIVITY_SECTOR_OPTIONS = [
  { value: 'animalier', label: 'Animalier' },
  { value: 'agriculture_producteurs', label: 'Agriculture / Producteurs locaux' },
  { value: 'architecture_design', label: 'Architecture / Design intérieur' },
  { value: 'bois_foret', label: 'Bois & Forêt' },
  { value: 'energie_habitat', label: 'Énergie / Équipements habitat' },
  { value: 'funeraire', label: 'Funéraire' },
  { value: 'metiers_art', label: 'Métiers d’art / Artisanat spécialisé' },
  { value: 'assurance', label: 'Assurance' },
  { value: 'automobile', label: 'Automobile' },
  { value: 'beaute_bien_etre', label: 'Beauté / Bien-être' },
  { value: 'artisan_btp', label: 'BTP' },
  { value: 'commerce_boutique', label: 'Commerce / Boutique' },
  { value: 'communication', label: 'Communication' },
  { value: 'education_enfance', label: 'Éducation / Enfance' },
  { value: 'evenementiel', label: 'Événementiel' },
  { value: 'exterieur_jardin', label: 'Extérieur / Jardin' },
  { value: 'finance', label: 'Finance' },
  { value: 'hotel_restaurant', label: 'Hôtel / Restaurant' },
  { value: 'hygiene_habitat', label: 'Hygiène / Habitat' },
  { value: 'immobilier', label: 'Immobilier' },
  { value: 'industrie', label: 'Industrie' },
  { value: 'juridique', label: 'Juridique' },
  { value: 'loisirs_sport', label: 'Loisirs / Sport' },
  { value: 'medecine_douce', label: 'Médecine douce' },
  { value: 'sante', label: 'Santé' },
  { value: 'securite', label: 'Sécurité' },
  { value: 'services_entreprises', label: 'Services aux entreprises' },
  { value: 'services_particuliers', label: 'Services aux particuliers' },
  { value: 'transport', label: 'Transport' },
  { value: 'tourisme', label: 'Tourisme' },
  { value: 'autre', label: 'Autre' },
] as const;

export type ActivitySectorCategory = (typeof ACTIVITY_SECTOR_OPTIONS)[number]['value'];

export const DEFAULT_ACTIVITY_SECTOR: ActivitySectorCategory = 'autre';

const VALID_VALUES = new Set<string>(ACTIVITY_SECTOR_OPTIONS.map((o) => o.value));
const LABELS = new Map<string, string>(ACTIVITY_SECTOR_OPTIONS.map((o) => [o.value, o.label]));

const PREFIX_RE = /^\[\[SECTOR:([a-z_]+)\]\]\s*/i;

export function isActivitySectorCategory(value: string): value is ActivitySectorCategory {
  return VALID_VALUES.has(value);
}

export function getActivitySectorLabel(value?: string | null): string {
  if (!value) return LABELS.get(DEFAULT_ACTIVITY_SECTOR) || 'Autre';
  return LABELS.get(value) || LABELS.get(DEFAULT_ACTIVITY_SECTOR) || 'Autre';
}

export function inferSectorCategoryFromProfession(input?: string | null): ActivitySectorCategory {
  const value = String(input || '').toLowerCase();
  if (!value) return DEFAULT_ACTIVITY_SECTOR;

  if (/(bois de chauffage|bûche|buche|stère|stere|granulé|granule|exploitant forestier|exploitation forestière|exploitation forestiere|travaux forestiers|débardage|debardage|scierie|négoce de bois|negoce de bois|bois sur pied|coupe forestière|coupe forestiere)/.test(value)) return 'bois_foret';
  if (/(architecte d’intérieur|architecte d'interieur|architecte interieur|architecte|décorateur d’intérieur|decorateur d'interieur|decorateur interieur|déco intérieur|deco interieur|maître d’œuvre|maitre d'oeuvre|maitre oeuvre|bureau d’études bâtiment|bureau d'etudes batiment|bureau etudes batiment|design intérieur|design interieur)/.test(value)) return 'architecture_design';
  if (/(agricult|producteur local|ferme|vente directe|maraîcher|maraicher|apiculteur|miel|pépiniériste|pepinieriste|viticulteur|domaine viticole|vigneron|produits locaux|panier local)/.test(value)) return 'agriculture_producteurs';
  if (/(panneaux solaires|solaire|photovoltaïque|photovoltaique|pompe à chaleur|pompe a chaleur|\bpac\b|domotique|maison connectée|maison connectee|poêle|poele|cheminée|cheminee|insert|borne de recharge|bornes de recharge|irve|véhicule électrique|vehicule electrique)/.test(value)) return 'energie_habitat';
  if (/(pompes funèbres|pompes funebres|funéraire|funeraire|obsèques|obseques|marbrerie funéraire|marbrerie funeraire|sépulture|sepulture|fleurissement sépulture|fleurissement sepulture|contrat obsèques|contrat obseques)/.test(value)) return 'funeraire';
  if (/(ébéniste|ebeniste|ferronnier d’art|ferronnier d'art|ferronnerie d’art|ferronnerie d'art|céramiste|ceramiste|couturier|couture|retouches|tapissier décorateur|tapissier decorateur|artisanat d’art|artisanat d'art|métiers d’art|metiers d'art)/.test(value)) return 'metiers_art';
  if (/(paysag|piscin|jardin|élag|elag|clôture|cloture|portail|arrosage|espace vert|espaces verts|terrassement paysager)/.test(value)) return 'exterieur_jardin';
  if (/(métallurgie|metallurgie|usinage|chaudronnerie|plasturgie|fabrication industrielle|maintenance industrielle|mécanique industrielle|mecanique industrielle|soudure industrielle|traitement de surface|industrie|industriel)/.test(value)) return 'industrie';
  if (/(plomb|chauffag|électric|electric|maçon|macon|couvreur|menuis|carrel|peintre|charpent|construction|clim|serrur|bât|bat|travaux|renov|rénov|terrassement|façade|facade|isolation|plaquiste|placo|cuisiniste|cuisine sur mesure|agenceur|agencement|poseur de sols|poseur sols|parquet|étancheur|etancheur|étanchéité|etancheite)/.test(value)) return 'artisan_btp';
  if (/(assur|mutuelle|prévoyance|prevoyance|courtier en assurance|courtier assurance|agent général d’assurance|agent general d'assurance|agent general assurance|cabinet d’assurance|cabinet d'assurance|sinistre|responsabilité civile pro|responsabilite civile pro|rc pro)/.test(value)) return 'assurance';
  if (/(crèche|creche|micro-crèche|micro creche|soutien scolaire|cours particuliers|aide aux devoirs|école privée|ecole privee|coach scolaire|centre de loisirs|accueil de loisirs|périscolaire|periscolaire|projet pédagogique|projet pedagogique)/.test(value)) return 'education_enfance';
  if (/(salle de sport|club de sport|club sportif|escape game|parc de loisirs|base nautique|activité nautique|activite nautique|activités nautiques|activites nautiques|paddle|kayak|voile|professeur de danse|cours de danse|professeur de yoga|cours de yoga|loisirs|billetterie loisirs)/.test(value)) return 'loisirs_sport';
  if (/(camping|mobil-home|mobil home|location saisonnière|location saisonniere|guide touristique|visite guidée|visite guidee|excursion|office de tourisme|activité touristique|activite touristique|séjour touristique|sejour touristique|tourisme)/.test(value)) return 'tourisme';
  if (/(garage|auto|carross|pneu|moto|contrôle technique|controle technique|vidange|pare-brise|pare brise|location de véhicules|location de vehicules)/.test(value)) return 'automobile';
  if (/(boutique|magasin|fleur|boulang|pâtiss|patiss|épicer|epicer|librair|opticien|bijout|caviste|meuble|commerce|concept store|friperie)/.test(value)) return 'commerce_boutique';
  if (/(restaurant|hôtel|hotel|bar|brasserie|snack|traiteur|café|cafe|bistr|pizzeria|chambre d'hôtes|chambre d'hotes)/.test(value)) return 'hotel_restaurant';
  if (/(esthétique|esthet|coiff|spa|massage|barber|ongler|bien-être|bien etre|institut|maquill|épilation|epilation|coach sportif|nutrition)/.test(value)) return 'beaute_bien_etre';
  if (/(médecin|medecin|dent|kiné|kine|ostéo|osteo|pharm|podolog|orthophon|psycholog|sage-femme|clinique|infirm)/.test(value)) return 'sante';
  if (/(naturopath|sophrolog|réflexolog|reflexolog|hypnos|magnét|magnet|énergét|energet|shiatsu|ayurv|reiki)/.test(value)) return 'medecine_douce';
  if (/(immobili|diagnostiqueur|promoteur|courtier|syndic|gestion locative|transaction|mandat)/.test(value)) return 'immobilier';
  if (/(ménage|menage|garde d'enfants|aide à domicile|aide a domicile|jardinage|dépannage|depannage|conciergerie|aide ménag|livraison)/.test(value)) return 'services_particuliers';
  if (/(créateur de site|createur de site|création de site|creation de site|site internet|site web|webmaster|imprimeur|imprimerie|enseigniste|enseigne lumineuse|signalétique|signaletique|vitrophanie|photographe professionnel|photographe pro|photo entreprise|portrait professionnel)/.test(value)) return 'communication';
  if (/(consult|agence|marketing|formation|informat|b2b|expert-comptable|comptable|rh|recrutement|secrétariat|secretariat|cabinet de conseil)/.test(value)) return 'services_entreprises';
  if (/(communication|community manager|social media|attaché de presse|attache de presse|branding|studio créa|studio crea|graphiste|seo|sea|marketing digital|content manager)/.test(value)) return 'communication';
  if (/(juridique|avocat|notaire|juriste|huissier|commissaire de justice|cabinet juridique|droit)/.test(value)) return 'juridique';
  if (/(finance|courtage financier|gestion de patrimoine|patrimoine|cgp|conseiller financier|audit financier|daf|expert financier|trésorerie|tresorerie)/.test(value)) return 'finance';
  if (/(dj|photograph|vidéaste|videaste|wedding|événement|evenement|salle de réception|salle de reception|location matériel|location materiel|traiteur évènement|traiteur evenement)/.test(value)) return 'evenementiel';
  if (/(animal|vétér|veter|toilett|écurie|ecurie|éleveur|élevage|elevage|pension canine|pension féline|pension feline|maréchal|marechal)/.test(value)) return 'animalier';
  if (/(transport|taxi|vtc|chauffeur|ambulance|ambulancier|livraison|coursier|messagerie|fret|marchandises|logistique|demenagement)/.test(value)) return 'transport';
  if (/(sécurité|securite|gardiennage|incendie|télésurveillance|telesurveillance|vidéosurveillance|videosurveillance|contrôle d’accès|controle d'acces|agent de sécurité|agent de securite)/.test(value)) return 'securite';

  return DEFAULT_ACTIVITY_SECTOR;
}

export function decodeBusinessSector(raw?: string | null): { sectorCategory: ActivitySectorCategory; profession: string } {
  const input = String(raw || '').trim();
  if (!input) return { sectorCategory: DEFAULT_ACTIVITY_SECTOR, profession: '' };

  const match = input.match(PREFIX_RE);
  if (match) {
    const maybe = match[1]?.toLowerCase?.() || '';
    const sectorCategory = isActivitySectorCategory(maybe) ? maybe : DEFAULT_ACTIVITY_SECTOR;
    return {
      sectorCategory,
      profession: input.replace(PREFIX_RE, '').trim(),
    };
  }

  return {
    sectorCategory: inferSectorCategoryFromProfession(input),
    profession: input,
  };
}

export function encodeBusinessSector(sectorCategory: string, profession: string): string {
  const category = isActivitySectorCategory(sectorCategory) ? sectorCategory : DEFAULT_ACTIVITY_SECTOR;
  const cleanProfession = String(profession || '').trim();
  return `[[SECTOR:${category}]] ${cleanProfession}`.trim();
}
