export const ACTIVITY_SECTOR_OPTIONS = [
  { value: 'animalier', label: 'Animalier' },
  { value: 'automobile', label: 'Automobile' },
  { value: 'beaute_bien_etre', label: 'Beauté / Bien-être' },
  { value: 'artisan_btp', label: 'BTP' },
  { value: 'commerce_boutique', label: 'Commerce / Boutique' },
  { value: 'communication', label: 'Communication' },
  { value: 'evenementiel', label: 'Événementiel' },
  { value: 'exterieur_jardin', label: 'Extérieur / Jardin' },
  { value: 'finance', label: 'Finance' },
  { value: 'hotel_restaurant', label: 'Hôtel / Restaurant' },
  { value: 'hygiene_habitat', label: 'Hygiène / Habitat' },
  { value: 'immobilier', label: 'Immobilier' },
  { value: 'industrie', label: 'Industrie' },
  { value: 'juridique', label: 'Juridique' },
  { value: 'medecine_douce', label: 'Médecine douce' },
  { value: 'sante', label: 'Santé' },
  { value: 'securite', label: 'Sécurité' },
  { value: 'services_entreprises', label: 'Services aux entreprises' },
  { value: 'services_particuliers', label: 'Services aux particuliers' },
  { value: 'transport', label: 'Transport' },
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

  if (/(paysag|piscin|jardin|élag|elag|clôture|cloture|portail|arrosage|espace vert|espaces verts|terrassement paysager)/.test(value)) return 'exterieur_jardin';
  if (/(métallurgie|metallurgie|scierie|usinage|chaudronnerie|plasturgie|fabrication industrielle|maintenance industrielle|mécanique industrielle|mecanique industrielle|soudure industrielle|traitement de surface|industrie|industriel)/.test(value)) return 'industrie';
  if (/(plomb|chauffag|électric|electric|maçon|macon|couvreur|menuis|carrel|peintre|charpent|construction|clim|serrur|bât|bat|travaux|renov|rénov|terrassement|façade|facade|isolation)/.test(value)) return 'artisan_btp';
  if (/(garage|auto|carross|pneu|moto|contrôle technique|controle technique|vidange|pare-brise|pare brise|location de véhicules|location de vehicules)/.test(value)) return 'automobile';
  if (/(boutique|magasin|fleur|boulang|pâtiss|patiss|épicer|epicer|librair|opticien|bijout|caviste|meuble|commerce|concept store|friperie)/.test(value)) return 'commerce_boutique';
  if (/(restaurant|hôtel|hotel|bar|brasserie|snack|traiteur|café|cafe|bistr|pizzeria|chambre d'hôtes|chambre d'hotes)/.test(value)) return 'hotel_restaurant';
  if (/(esthétique|esthet|coiff|spa|massage|barber|ongler|bien-être|bien etre|institut|maquill|épilation|epilation|coach sportif|nutrition)/.test(value)) return 'beaute_bien_etre';
  if (/(médecin|medecin|dent|kiné|kine|ostéo|osteo|pharm|podolog|orthophon|psycholog|sage-femme|clinique|infirm)/.test(value)) return 'sante';
  if (/(naturopath|sophrolog|réflexolog|reflexolog|hypnos|magnét|magnet|énergét|energet|shiatsu|ayurv|reiki)/.test(value)) return 'medecine_douce';
  if (/(immobili|diagnostiqueur|promoteur|courtier|syndic|gestion locative|transaction|mandat)/.test(value)) return 'immobilier';
  if (/(ménage|menage|garde d'enfants|aide à domicile|aide a domicile|jardinage|dépannage|depannage|conciergerie|aide ménag|livraison)/.test(value)) return 'services_particuliers';
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
