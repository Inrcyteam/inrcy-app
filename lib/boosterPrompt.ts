import { getJobLabel } from "@/lib/activityCatalog";
import {
  decodeBusinessSector,
  getActivitySectorLabel,
} from "@/lib/activitySectors";

export type BoosterChannels =
  | "inrcy_site"
  | "site_web"
  | "gmb"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "youtube_shorts";

export type BoosterTheme =
  | ""
  | "promotion"
  | "information"
  | "conseil"
  | "avis_client"
  | "realisation"
  | "actualite"
  | "autre";

export type BoosterStyle = "sobre" | "equilibre" | "dynamique";

export type BoosterHiddenAngle =
  | "retour_terrain"
  | "conseil_pratique"
  | "coulisses"
  | "storytelling"
  | "question_engageante"
  | "mini_astuce"
  | "proximite_locale"
  | "preuve_concrete";

export type BoosterRecentPublication = {
  title?: string | null;
  content?: string | null;
  cta?: string | null;
  idea?: string | null;
  created_at?: string | null;
};

const CHANNEL_LABELS: Record<BoosterChannels, string> = {
  inrcy_site: "Site iNrCy",
  site_web: "Site web",
  gmb: "Google Business",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube_shorts: "YouTube",
};

const THEME_LABELS: Record<BoosterTheme, string> = {
  "": "Non précisé",
  promotion: "Promotion",
  information: "Information",
  conseil: "Conseil / Astuce",
  avis_client: "Avis client / preuve sociale",
  realisation: "Réalisation / intervention / chantier",
  actualite: "Actualité / nouveauté",
  autre: "Autre",
};

const STYLE_LABELS: Record<BoosterStyle, string> = {
  sobre: "Sobre",
  equilibre: "Équilibré",
  dynamique: "Dynamique",
};

const HIDDEN_ANGLE_LABELS: Record<BoosterHiddenAngle, string> = {
  retour_terrain: "Retour terrain",
  conseil_pratique: "Conseil pratique",
  coulisses: "Coulisses du métier",
  storytelling: "Petite histoire concrète",
  question_engageante: "Question engageante",
  mini_astuce: "Mini astuce",
  proximite_locale: "Proximité locale",
  preuve_concrete: "Preuve concrète",
};

const HIDDEN_ANGLE_INSTRUCTIONS: Record<BoosterHiddenAngle, string> = {
  retour_terrain:
    "Partir d'une situation réaliste vécue sur le terrain ou d'une intervention du quotidien, sans inventer de détail précis non fourni.",
  conseil_pratique:
    "Apporter un conseil simple et utile au lecteur, relié naturellement à l'intention du pro.",
  coulisses:
    "Montrer discrètement l'envers du décor : préparation, méthode, soin apporté, organisation ou façon de travailler.",
  storytelling:
    "Donner une impression de petite histoire concrète avec un début naturel, mais sans créer de faux client, faux lieu ou faux événement.",
  question_engageante:
    "Ouvrir ou rythmer le message avec une question naturelle qui parle au besoin du lecteur, sans faire racoleur.",
  mini_astuce:
    "Glisser une astuce courte, pratique et facile à comprendre, sans transformer le post en tutoriel complet.",
  proximite_locale:
    "Renforcer la proximité avec la ville, les zones ou les habitudes locales, de manière naturelle et non répétitive.",
  preuve_concrete:
    "Mettre en avant des éléments concrets : prestation, méthode, réactivité, soin, résultat attendu ou point de vigilance, sans promesse exagérée.",
};

const CHANNEL_EDITORIAL_PLAYBOOKS: Record<BoosterChannels, string> = {
  inrcy_site:
    "Objectif : produire une actualité utile pour le site iNrCy. Priorité au SEO local naturel, à la clarté et à la conversion douce. Accroche informative, paragraphes lisibles, mots-clés intégrés sans bourrage, 2 à 5 expressions importantes en gras Markdown uniquement dans le contenu.",
  site_web:
    "Objectif : produire un contenu publiable sur le site web du pro. Priorité au référencement local durable, à la crédibilité métier et à la lecture fluide. Mettre en avant le métier, la ville, les prestations cohérentes avec l'intention et les zones, sans transformer le texte en liste de mots-clés.",
  gmb:
    "Objectif : informer localement sur Google Business. Texte factuel, concret, rassurant et très sobre. Une information utile dès le début, pas de ton promotionnel agressif, pas d'emoji, pas de hashtag, pas de téléphone, pas d'email, pas d'URL, pas de remise, pas de promesse invérifiable.",
  facebook:
    "Objectif : créer de la proximité et donner envie d'interagir. Ton humain, accessible, local, conversationnel. On peut parler du quotidien, d'une intervention, d'un conseil ou d'un besoin client typique, sans inventer de faux témoignage. CTA naturel, pas trop vendeur.",
  instagram:
    "Objectif : donner une impression visuelle et vivante. Texte plus direct, spontané, chaleureux, avec des phrases courtes et du relief. Faire sentir l'ambiance, le geste, le résultat ou le moment. Hashtags utiles et ciblés. Ne pas écrire 'lien en bio' sauf si l'information est fournie.",
  linkedin:
    "Objectif : renforcer l'expertise et la crédibilité professionnelle. Ton posé, utile, structuré et humain. Montrer une méthode, un point de vigilance, une valeur métier ou une réflexion professionnelle. Éviter le ton trop commercial, les emojis excessifs et les accroches de vente directe.",
  tiktok:
    "Objectif : capter vite l'attention avec une accroche courte, naturelle et dynamique. Texte pensé pour accompagner une vidéo ou des photos : concret, vivant, local, avec 3 à 6 hashtags utiles. Éviter le ton institutionnel ou LinkedIn.",
  youtube_shorts:
    "Objectif : préparer une vidéo YouTube utile et claire. Si la vidéo est courte et verticale/carrée, elle pourra partir en Short ; sinon elle sera une vidéo classique. Accroche immédiate, message local, titre propre et description lisible.",
};

function formatChannelPlaybooks(channels: BoosterChannels[]) {
  return Array.from(new Set(channels))
    .map((channel) => `- ${CHANNEL_LABELS[channel]} : ${CHANNEL_EDITORIAL_PLAYBOOKS[channel]}`)
    .join("\n");
}

export function pickBoosterHiddenAngle(): BoosterHiddenAngle {
  const angles = Object.keys(HIDDEN_ANGLE_LABELS) as BoosterHiddenAngle[];
  return angles[Math.floor(Math.random() * angles.length)] || "retour_terrain";
}

const TONE_LABELS: Record<string, string> = {
  pro: "Professionnel",
  friendly: "Chaleureux",
  premium: "Premium",
  direct: "Direct",
};

const CTA_LABELS: Record<string, string> = {
  none: "Aucun bouton",
  site: "Voir le site",
  devis: "Demander un devis",
  appeler: "Appeler",
  message: "Envoyer un message",
  custom: "Lien personnalisé",
};

const COMMUNICATION_STYLE_LABELS: Record<string, string> = {
  local_humain: "Local et humain",
  professionnel: "Professionnel",
  premium: "Haut de gamme",
  simple: "Simple et accessible",
  moderne: "Moderne et dynamique",
};

const EMOJI_LEVEL_LABELS: Record<string, string> = {
  none: "Aucun emoji",
  light: "Emojis légers",
  moderate: "Emojis modérés",
  dynamic: "Emojis dynamiques",
};

const LENGTH_LABELS: Record<string, string> = {
  short: "Court",
  medium: "Moyen",
  detailed: "Détaillé",
};

const ADDRESS_MODE_LABELS: Record<string, string> = {
  vous: "Vouvoiement",
  tu: "Tutoiement",
  auto: "Automatique selon le canal et le métier",
};

const AI_VOICE_LABELS: Record<string, string> = {
  auto: "Automatique selon le contexte",
  je: "Je / première personne du singulier",
  nous: "Nous / première personne du pluriel",
  neutral: "Neutre, sans je ni nous",
};

const CREATIVITY_LABELS: Record<string, string> = {
  stable: "Stable et maîtrisé",
  balanced: "Équilibré",
  creative: "Créatif et plus vivant",
};

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  particuliers: "Particuliers",
  professionnels: "Professionnels",
  collectivites: "Collectivités",
};

function labelFromMap(
  value: unknown,
  labels: Record<string, string>,
  fallback = "Non précisé",
) {
  const key = String(value || "").trim();
  return key ? labels[key] || key : fallback;
}

function labelsFromArray(value: unknown, labels: Record<string, string>) {
  if (!Array.isArray(value)) return "Non précisé";
  const out = value
    .map((item) => labelFromMap(item, labels, ""))
    .filter(Boolean);
  return out.length ? out.join(", ") : "Non précisé";
}

function cleanText(value: unknown, maxLength = 220) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanList(value: unknown, maxItems = 8, maxItemLength = 70) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/[,;\n]/)
        .map((item) => item.trim());

  return Array.from(
    new Set(
      rawItems.map((item) => cleanText(item, maxItemLength)).filter(Boolean),
    ),
  ).slice(0, maxItems);
}

function joinList(value: unknown, maxItems = 8, fallback = "Non renseigné") {
  const items = cleanList(value, maxItems);
  return items.length ? items.join(", ") : fallback;
}

function optionalLine(label: string, value: unknown, maxLength = 220) {
  const clean = cleanText(value, maxLength);
  return clean ? `- ${label} : ${clean}` : "";
}

function optionalListLine(label: string, value: unknown, maxItems = 8) {
  const items = cleanList(value, maxItems);
  return items.length ? `- ${label} : ${items.join(", ")}` : "";
}

function compactLines(lines: string[]) {
  return lines.filter((line) => line.trim()).join("\n");
}

function formatRecentPublications(
  publications?: BoosterRecentPublication[] | null,
) {
  if (!Array.isArray(publications) || !publications.length) return "";

  return publications
    .slice(0, 5)
    .map((publication, index) => {
      const title = cleanText(publication.title, 90);
      const idea = cleanText(publication.idea, 120);
      const content = cleanText(publication.content, 220);
      const cta = cleanText(publication.cta, 80);

      const parts = [
        title ? `titre: ${title}` : "",
        idea ? `idée: ${idea}` : "",
        content ? `extrait: ${content}` : "",
        cta ? `cta: ${cta}` : "",
      ].filter(Boolean);

      return parts.length ? `${index + 1}. ${parts.join(" | ")}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function getActivityDescription(business: Record<string, any>) {
  return (
    business.business_description ||
    business.activity_description ||
    business.company_description ||
    business.description ||
    ""
  );
}

export function boosterSystemPrompt() {
  return `Tu es un assistant marketing local pour des pros de proximité en France.

Ta mission : à partir d'une même intention du pro, générer EN UNE FOIS des contenus différents selon les canaux demandés.

Important :
- L'intention libre saisie par le pro est le sujet principal obligatoire. Tous les contenus doivent rester clairement centrés dessus.
- Si des images sont jointes, elles servent uniquement de contexte visuel pour enrichir et préciser l'intention libre. Elles ne doivent jamais prendre le dessus ni changer le sujet demandé.
- Priorité de raisonnement : 1) intention libre, 2) images si pertinentes, 3) activité/profil, 4) adaptation par canal.
- Le contexte métier, l'activité, les prestations, la ville, le thème, le style, l'historique et l'angle éditorial servent uniquement à contextualiser cette intention : ils ne doivent jamais la remplacer.
- Si l'intention du pro est précise, ne pars pas sur un sujet général de l'activité et n'invente pas un autre angle plus commode.
- Tu dois adapter le ton, la longueur, le rythme, l'accroche et l'ambiance au canal ET au style demandé.
- Tu ne dois pas inventer de faits précis si l'information n'est pas fournie.
- Tu peux reformuler, structurer et enrichir légèrement, mais sans mentir.
- Tu dois tenir compte du secteur, du métier, des prestations, de la ville et du thème choisi seulement quand cela aide à traiter l'intention du pro.
- Les trois styles (sobre, équilibré, dynamique) doivent produire des textes VISIBLEMENT différents. Pas de simples nuances.
- Les contenus doivent sembler écrits par un vrai professionnel local, pas par une IA marketing.
- Éviter les formulations trop parfaites, trop génériques ou trop publicitaires.
- Varier naturellement les tournures, les rythmes et les débuts de phrases.
- Le texte doit parfois sembler spontané, concret et vivant.
- Intégrer quand c'est pertinent des éléments de terrain, de quotidien métier ou de ressenti humain.
- Éviter les structures systématiques du type : accroche marketing + liste de bénéfices + CTA artificiel.
- Ne pas répéter toujours les mêmes expressions marketing ou emojis.
- Éviter autant que possible les formulations comme : "Découvrez", "N'hésitez pas à", "Nous sommes ravis", "Profitez de", sauf si cela paraît réellement naturel.
- Le lecteur ne doit jamais avoir l'impression que le texte a été généré automatiquement.
- Ne pas produire un plan trop mécanique ni des paragraphes qui se ressemblent d'une génération à l'autre.
- Préférer une écriture incarnée : phrases simples, détails concrets, rythme naturel, sans surjouer.

Règles par canal :
- Site iNrCy / Site web : texte SEO local de 180 à 320 mots, sans rallonger inutilement. Intégrer naturellement le métier principal, la ville, 2 à 4 prestations, 1 à 3 zones d'intervention et des variantes de mots-clés proches. Remplacer les phrases vagues par des phrases utiles au référencement. Pour le contenu uniquement, mettre en gras 2 à 5 expressions clés maximum avec le format Markdown **expression** (métier + ville, prestation, zone). Ne jamais mettre une phrase entière en gras et ne jamais faire de liste brute de mots-clés. Le style doit rester humain et lisible, pas une page SEO artificielle.
- Si Site iNrCy et Site web sont demandés ensemble : garder la même intention commerciale, mais produire deux variantes distinctes. Varier le titre, l'accroche, l'ordre des prestations, quelques formulations, et quand les données existent, répartir naturellement les villes/zones/prestations renseignées. Ne jamais inventer de ville, zone ou prestation absente du profil ou de Mon activité.
- Google Business : texte local, utile, simple, environ 80 à 140 mots, strictement conforme aux règles Google Business Profile. Commencer par une information concrète, rester factuel, pas d'emoji, pas de hashtag, pas de téléphone, pas d'email, pas d'URL, pas de réduction ni de promesse agressive.
- Facebook : texte engageant, clair, proche du quotidien et de la vie locale, environ 80 à 160 mots. Le ton doit donner l'impression d'un vrai pro qui parle à sa communauté, pas d'une publicité générique.
- Instagram : texte visuel, direct, spontané et vivant, environ 70 à 140 mots. Donner une impression d'image, d'ambiance, de geste métier ou de résultat. Hashtags utiles, ciblés, jamais une liste générique.
- LinkedIn : texte plus professionnel, crédible, utile et structuré, environ 100 à 220 mots. Mettre en avant expertise, méthode, recul métier ou conseil pro. Éviter le ton vendeur, les slogans et les emojis excessifs.
- Facebook / Instagram / LinkedIn / Google Business : ne jamais utiliser de Markdown ni de balises HTML de formatage. Ces canaux doivent rester en texte brut.

Aération et retours à la ligne :
- Aérer naturellement les contenus avec des paragraphes courts quand le canal s'y prête.
- Facebook, Instagram, LinkedIn et Google Business : viser 2 à 4 courts paragraphes maximum, selon la longueur du texte.
- Site iNrCy / Site web : structurer en paragraphes lisibles, sans créer de liste froide ni de découpage excessif.
- Ne pas ajouter de retours à la ligne excessifs, de lignes isolées inutiles ou d'effet "post LinkedIn influenceur".
- Ne jamais rendre un gros bloc de texte compact quand le contenu dépasse quelques phrases.

Différences de styles à respecter impérativement :
- Style SOBRE : ton rassurant, posé, sobre et crédible. Accroche simple et informative. Phrases plus complètes et fluides. Très peu d'effet marketing. Pas de surjeu. Pas d'abus de points d'exclamation. Emojis absents ou presque absents.
- Style ÉQUILIBRÉ : ton pro, humain, chaleureux et engageant. Accroche plus vivante mais naturelle. Phrases fluides avec un peu plus de relief. Le texte doit être plus chaleureux que le style sobre, sans devenir trop commercial. Emojis modérés.
- Style DYNAMIQUE : ton nettement plus énergique, vivant, accrocheur et entraînant. Accroche forte dès le début. Phrases plus courtes, plus rythmées, plus incarnées. Le texte doit être clairement plus punchy que les deux autres styles, tout en restant professionnel. Emojis plus présents quand le canal le permet, surtout sur Facebook et Instagram.

Règles d'emojis par style et par canal :
- Site iNrCy / Site web : 0 emoji, quel que soit le style.
- Google Business : 0 emoji de préférence. À la rigueur 0 à 1 emoji uniquement en style équilibré ou dynamique si cela reste très naturel, non promotionnel et parfaitement compatible avec Google Business Profile.
- Facebook :
  - Sobre : 0 à 1 emoji maximum.
  - Équilibré : 1 à 3 emojis maximum.
  - Dynamique : 3 à 5 emojis maximum.
- Instagram :
  - Sobre : 0 à 2 emojis maximum.
  - Équilibré : 2 à 5 emojis maximum.
  - Dynamique : 4 à 8 emojis maximum.
- LinkedIn :
  - Sobre : 0 emoji.
  - Équilibré : 0 à 1 emoji maximum.
  - Dynamique : 1 à 2 emojis maximum.
- Les emojis doivent rester utiles, naturels et lisibles. Jamais de surcharge artificielle. Le style dynamique peut être plus expressif sur Facebook et Instagram, mais doit rester propre.

Contraintes :
- Français uniquement.
- Ton pro, humain, local, simple et crédible.
- Les textes doivent rester naturels et conversationnels.
- Pas de jargon marketing inutile.
- Pas de promesses illégales ou invérifiables.
- Pas d'adresse exacte ni de nom de client.
- Le téléphone, s'il est fourni, peut apparaître naturellement quand c'est utile, au maximum une fois par canal SAUF pour Google Business où il ne doit jamais apparaître.
- L'email, s'il est fourni, peut aussi être utilisé quand c'est pertinent, surtout dans le CTA ou la version site, SAUF pour Google Business où il ne doit jamais apparaître.
- Pour Google Business, ne jamais inclure de numéro de téléphone, d'email, d'URL, de hashtag, d'offre promotionnelle agressive, de remise, de réduction, de contenu trompeur ou de promesse invérifiable.
- Pour Google Business, privilégier un ton informatif, local, factuel et utile. Le CTA doit rester très neutre, par exemple : "En savoir plus", "Découvrir" ou "Voir les informations".
- La ville / zone doit être utilisée naturellement, pas sous forme de liste brute.

Tu dois répondre en JSON strict, avec exactement cette structure :
{
  "versions": {
    "<clé_canal_demandé>": { "title": string, "content": string, "cta": string, "hashtags": string[] }
  }
}

Clés de canaux autorisées : inrcy_site, site_web, gmb, facebook, instagram, linkedin, tiktok, youtube_shorts.

Règles JSON :
- Ne renvoyer que les canaux explicitement demandés dans la requête utilisateur.
- Chaque version doit contenir les 4 clés title/content/cta/hashtags.
- Pour chaque canal demandé, title, content et cta doivent être non vides.
- Pour Google Business, le CTA doit rester neutre et non promotionnel.
- hashtags = tableau de 0 à 8 mots-clés sans #.
- Les hashtags sont utiles pour Instagram et TikTok : pour les autres canaux, renvoie de préférence [].
- Si un canal n'est pas demandé, ne pas l'ajouter.
- Le title doit rester court (idéalement < 80 caractères) et ne doit jamais contenir de Markdown ni de balises HTML.
- Le CTA doit être court et actionnable, sans Markdown ni balises HTML.
- Ne jamais écrire de balise HTML dans les contenus. Pour le gras des contenus site uniquement, utiliser **texte**.`;
}

export function boosterUserPrompt(args: {
  idea: string;
  theme: BoosterTheme;
  style: BoosterStyle;
  channels: BoosterChannels[];
  profile?: Record<string, any> | null;
  business?: Record<string, any> | null;
  hiddenAngle?: BoosterHiddenAngle;
  recentPublications?: BoosterRecentPublication[] | null;
}) {
  const profile = args.profile || {};
  const business = args.business || {};

  const company = cleanText(
    profile.company_legal_name || profile.companyLegalName || "",
    100,
  );
  const city = cleanText(profile.hq_city || profile.hqCity || "", 80);
  const phone = cleanText(profile.phone || "", 60);
  const email = cleanText(
    profile.contact_email || profile.contactEmail || "",
    100,
  );
  const postalCode = cleanText(profile.hq_zip || profile.hqZip || "", 20);

  const decodedSector = decodeBusinessSector(business.sector || "");
  const sectorCategory = getActivitySectorLabel(decodedSector.sectorCategory);
  const profession = cleanText(
    getJobLabel(decodedSector.sectorCategory, decodedSector.profession) ||
      decodedSector.profession,
    120,
  );
  const zones = cleanList(
    business.intervention_zones || business.intervention_zones_text,
    6,
  );
  const days = cleanText(business.opening_days, 80);
  const hours = cleanText(business.opening_hours, 80);
  const strengths = cleanList(business.strengths || business.strengths_text, 6);
  const services = cleanList(business.services || business.services_text, 10);
  const activityDescription = cleanText(getActivityDescription(business), 420);
  const tone = labelFromMap(business.tone, TONE_LABELS, "Professionnel");
  const preferredCta = labelFromMap(
    business.preferred_cta,
    CTA_LABELS,
    "Demander un devis",
  );
  const communicationStyle = labelFromMap(
    business.communication_style,
    COMMUNICATION_STYLE_LABELS,
    "Local et humain",
  );
  const emojiLevel = labelFromMap(
    business.emoji_level,
    EMOJI_LEVEL_LABELS,
    "Emojis légers",
  );
  const length = labelFromMap(business.ai_length, LENGTH_LABELS, "Moyen");
  const addressMode = labelFromMap(
    business.address_mode,
    ADDRESS_MODE_LABELS,
    "Vouvoiement",
  );
  const aiVoice = labelFromMap(
    business.ai_voice,
    AI_VOICE_LABELS,
    "Automatique selon le contexte",
  );
  const creativity = labelFromMap(
    business.ai_creativity,
    CREATIVITY_LABELS,
    "Équilibré",
  );
  const aiCustomInstructions = cleanText(business.ai_custom_instructions, 500);
  const customerTypes = labelsFromArray(
    business.customer_typologies,
    CUSTOMER_TYPE_LABELS,
  );
  const hiddenAngle = args.hiddenAngle || "retour_terrain";
  const hiddenAngleLabel = HIDDEN_ANGLE_LABELS[hiddenAngle];
  const hiddenAngleInstruction = HIDDEN_ANGLE_INSTRUCTIONS[hiddenAngle];
  const recentPublicationMemory = formatRecentPublications(args.recentPublications);
  const channelPlaybooks = formatChannelPlaybooks(args.channels);

  const businessIdentity = compactLines([
    optionalLine("Entreprise", company, 100),
    optionalLine("Ville principale", city, 80),
    optionalLine("Code postal", postalCode, 20),
    optionalLine("Téléphone", phone, 60),
    optionalLine("Email", email, 100),
  ]);

  const activityContext = compactLines([
    optionalLine("Secteur d'activité", sectorCategory, 80),
    optionalLine("Métier exact", profession, 120),
    optionalLine("Présentation de l'activité", activityDescription, 420),
    optionalListLine("Prestations / spécialités", services, 10),
    optionalListLine("Zones d'intervention", zones, 6),
    optionalLine("Jours d'ouverture", days, 80),
    optionalLine("Horaires", hours, 80),
    optionalListLine("Forces commerciales", strengths, 6),
    customerTypes !== "Non précisé"
      ? `- Typologie de clientèle : ${customerTypes}`
      : "",
  ]);

  const aiConfiguration = compactLines([
    `- Ton principal : ${tone}`,
    `- Style de communication : ${communicationStyle}`,
    `- Niveau d'emojis : ${emojiLevel}`,
    `- Longueur favorite : ${length}`,
    `- Tutoiement / vouvoiement : ${addressMode}`,
    `- Voix de l'entreprise : ${aiVoice}`,
    `- Créativité IA : ${creativity}`,
    `- CTA préféré : ${preferredCta}`,
    optionalLine("Consignes à respecter / à éviter", aiCustomInstructions, 500),
  ]);

  const siteSeoHints = compactLines([
    profession ? `- Mot-clé métier prioritaire : ${profession}` : "",
    city ? `- Ville prioritaire : ${city}` : "",
    services.length
      ? `- Prestations SEO à exploiter : ${services.slice(0, 5).join(", ")}`
      : "",
    zones.length
      ? `- Zones SEO à exploiter : ${zones.slice(0, 4).join(", ")}`
      : "",
  ]);

  return `Intention du pro — SUJET PRINCIPAL OBLIGATOIRE :
${args.idea}

Règle de priorité : cette intention libre doit guider le titre, l'accroche, le contenu et le CTA de chaque canal. Les informations de l'entreprise servent seulement à rendre le contenu crédible, local et adapté au métier. Si une consigne secondaire contredit ou éloigne le contenu de cette intention, ignorer la consigne secondaire et rester sur l'intention.

Thème choisi : ${THEME_LABELS[args.theme]}
Style souhaité : ${STYLE_LABELS[args.style]}
Canaux à générer : ${args.channels.map((c) => CHANNEL_LABELS[c]).join(", ")}

Guides éditoriaux précis par canal demandé :
${channelPlaybooks}

Identité entreprise disponible :
${businessIdentity || "- Aucune information d'identité complète renseignée."}

Contexte Mon activité à utiliser en priorité :
${activityContext || "- Mon activité est encore peu renseigné. Rester général, ne rien inventer."}

Références SEO locales pour les canaux site :
${siteSeoHints || "- Aucune référence SEO locale précise renseignée."}

Configuration IA enregistrée :
${aiConfiguration}

Angle éditorial invisible choisi par iNrCy :
- Type : ${hiddenAngleLabel}
- Consigne : ${hiddenAngleInstruction}
- Important : utiliser cet angle comme inspiration discrète uniquement s'il renforce l'intention du pro. Ne jamais nommer l'angle dans le texte, ne pas le forcer et ne jamais l'utiliser pour changer de sujet.

Historique récent des publications à ne pas répéter :
${recentPublicationMemory || "- Aucun historique récent disponible."}

Consignes supplémentaires :
- Avant d'écrire, identifier mentalement le sujet exact demandé dans l'intention du pro, puis produire chaque canal autour de ce sujet.
- Adapter clairement le contenu à chaque canal demandé sans changer le sujet de départ.
- Utiliser le contexte Mon activité seulement pour contextualiser l'intention : métier exact, prestations/spécialités, zones, forces, horaires et typologie de clientèle. Ne pas remplacer l'intention par une présentation générale de l'activité.
- Ne jamais afficher les champs absents et ne jamais inventer de prestation, de zone, de client, d'avis, de prix ou de résultat précis.
- Utiliser l'angle éditorial invisible pour varier les générations et éviter les textes répétitifs, uniquement s'il reste cohérent avec l'intention du pro.
- Utiliser l'historique récent uniquement comme garde-fou anti-répétition : ne pas copier, paraphraser ou reprendre les mêmes accroches, idées, CTA, structures ou tournures. L'historique ne doit jamais influencer le sujet du jour.
- Si l'intention actuelle ressemble à une ancienne publication, choisir un angle différent et une accroche différente, sans mentionner l'historique.
- Ne jamais considérer une ancienne publication comme une information actuelle certaine si elle contredit l'intention du jour.
- Le style demandé doit changer visiblement le ton, les accroches, le rythme des phrases et la présence d'emojis. Ne fais pas seulement une variation légère.
- La configuration IA enregistrée prime sur le style historique sobre/équilibré/dynamique si les deux donnent des signaux différents.
- Respecter les consignes personnalisées à respecter / à éviter si elles sont renseignées, sans jamais annuler les règles de conformité, les règles Google Business ou les contraintes de vérité.
- Si la typologie client est renseignée : particuliers = rassurant/simple/proximité ; professionnels = efficacité/expertise/réactivité ; collectivités = sérieux/fiabilité/conformité.
- Si les horaires sont renseignés, les utiliser seulement si cela apporte une information utile. Ne pas les répéter partout.
- Si les forces sont renseignées, les transformer en bénéfices concrets sans en faire une liste froide.
- Si les zones sont renseignées, citer 1 à 3 zones naturellement selon le canal, jamais sous forme de bourrage local.
- Si les prestations sont renseignées, choisir les plus cohérentes avec l'intention du pro au lieu de toutes les citer.
- Site iNrCy / Site web : version SEO locale, naturelle et concrète. Garder une longueur proche de la version actuelle : ne pas allonger le contenu, densifier plutôt les phrases existantes. Intégrer naturellement le métier exact, la ville, les prestations cochées, les zones d'intervention et leurs variantes sémantiques. Dans le content uniquement, ajoute 2 à 5 mises en gras maximum avec le format Markdown **...** sur des expressions importantes, jamais sur une phrase complète. Quand c'est pertinent, intégrer naturellement le téléphone ou l'email de contact. Cette version est obligatoire si le canal site est demandé : ne jamais laisser title/content/cta vides.
- Si les deux canaux site sont demandés, ne copie pas le même texte : Site iNrCy peut être plus vitrine/conversion, Site web un peu plus SEO durable. Les deux doivent rester cohérents avec la même activité et utiliser uniquement les villes, zones et prestations réellement renseignées.
- Instagram : plus direct, plus visuel, plus spontané et plus émotionnel, mais pas expédié en quelques lignes. Donner assez de matière pour que le message existe vraiment.
- LinkedIn : ton plus professionnel, plus crédible, plus expertise et plus humain que Facebook. Éviter le ton vendeur ou trop commercial.
- Google Business : ton local, utile, concret et strictement informatif. Ne jamais rappeler le téléphone, l'email, un lien, un hashtag ou une promesse commerciale agressive.
- Facebook : ton engageant, humain et accessible. Le texte peut sembler plus spontané et proche du quotidien. Le téléphone ou l'email peuvent être utilisés ponctuellement si cela aide à contacter l'entreprise.
- Respecter le niveau d'emojis configuré, tout en gardant 0 emoji sur Site iNrCy / Site web et une grande sobriété sur Google Business.
- Respecter la longueur favorite configurée sans casser les minimums utiles par canal.
- Respecter le tutoiement/vouvoiement configuré. En mode automatique, privilégier le vouvoiement pour LinkedIn, Google Business et les métiers sérieux/réglementés.
- Respecter la voix de l'entreprise configurée : "Je" = parler au nom d'une personne seule, "Nous" = parler au nom de l'entreprise/l'équipe, "Neutre" = éviter autant que possible je et nous, "Automatique" = choisir naturellement selon le profil et le contexte. Ne pas mélanger je et nous dans un même contenu sauf nécessité grammaticale.
- Respecter le CTA préféré lorsque le canal le permet, sauf Google Business qui doit rester neutre.
- Aérer le contenu avec des retours à la ligne naturels : 2 à 4 courts paragraphes maximum pour les réseaux sociaux et Google Business, davantage seulement pour les contenus site si nécessaire.
- Ne pas abuser des retours à la ligne : éviter les phrases isolées artificielles, les sauts de ligne après chaque phrase et les contenus éclatés.
- Pour Site iNrCy / Site web uniquement : renforcer le référencement naturel en répétant naturellement le couple métier + ville et les prestations principales, sans dépasser la longueur demandée et sans enchaîner des mots-clés artificiels.
- Pour Site iNrCy / Site web uniquement : utiliser uniquement le gras Markdown **...** avec modération sur les expressions SEO principales. Pour tous les autres canaux, ne jamais mettre de gras, d’italique, de souligné ou de balise HTML.

Exigences précises par style :
- Si le style demandé est "Sobre" : produire un texte clairement posé, rassurant, crédible et discret. Accroche simple. Peu d'effets. Phrases plutôt complètes. Zéro emphase inutile. Emojis absents ou quasi absents selon le canal.
- Si le style demandé est "Équilibré" : produire un texte humain, chaleureux, engageant et naturel. Accroche plus vivante. Phrases fluides avec du relief. Emojis modérés selon le canal.
- Si le style demandé est "Dynamique" : produire un texte visiblement plus punchy et entraînant. Commencer par une accroche plus forte. Utiliser des phrases plus rythmées et plus courtes quand c'est pertinent. Sur Facebook et Instagram, autoriser une présence d'emojis plus marquée que dans les autres styles, tout en restant lisible et professionnel.

Rappel important : les contenus doivent être à l'image de l'entreprise, mais rester vrais. Ils doivent surtout répondre au sujet libre saisi par le pro. Les contenus doivent aussi varier naturellement d'une génération à l'autre pour éviter l'effet robotique.`;
}
