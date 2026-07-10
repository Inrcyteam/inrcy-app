import { getJobLabel } from "@/lib/activityCatalog";
import {
  decodeBusinessSector,
  getActivitySectorLabel,
} from "@/lib/activitySectors";
import {
  buildAiLanguageInstruction,
  buildAiWritingProfilePromptSection,
  buildAiWritingProfileRules,
} from "@/lib/aiWritingProfile";
import { getAiPreferredEngineFromBusiness } from "@/lib/aiEnginePreference";

export type BoosterChannels =
  | "inrcy_site"
  | "site_web"
  | "gmb"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "youtube_shorts"
  | "pinterest";

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
  pinterest: "Pinterest",
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
    "Objectif : produire une actualité utile pour le site iNrCy. Priorité au SEO local naturel, à la clarté et à la conversion douce. Contenu riche, paragraphes lisibles, mots-clés intégrés sans bourrage, 2 à 5 expressions importantes en gras Markdown uniquement dans le contenu. Liste SEO propre possible si elle améliore la lecture, jamais systématique.",
  site_web:
    "Objectif : produire un contenu durable pour le site web du pro. Priorité au référencement local, à la crédibilité métier et à la lecture fluide. Le contenu doit être plus riche que les réseaux sociaux, avec métier, ville, prestations et zones intégrés naturellement. Liste SEO propre possible si elle améliore la lecture, jamais systématique.",
  gmb:
    "Objectif : informer localement sur Google Business. Texte factuel, concret, rassurant et sobre. Une information utile dès le début, pas de ton promotionnel agressif, pas de hashtag, pas de téléphone, pas d'email, pas d'URL, pas de remise, pas de promesse invérifiable. Emoji très sobre possible uniquement si la Configuration IA le demande fortement. Liste courte possible si elle clarifie le message, jamais systématique.",
  facebook:
    "Objectif : créer de la proximité et donner envie d'interagir. Ton humain, accessible, local, conversationnel. Parler du quotidien, d'une intervention, d'un conseil ou d'un besoin client typique, sans inventer de faux témoignage. CTA naturel, pas trop vendeur. Mini-liste possible si elle rend le post plus vivant ou lisible, jamais systématique.",
  instagram:
    "Objectif : donner une impression visuelle et vivante. Texte direct, spontané, chaleureux, avec des phrases courtes et du relief. Faire sentir l'ambiance, le geste, le résultat ou le moment. Mini-liste visuelle possible si elle sert le contenu, jamais systématique. Hashtags utiles et ciblés. Ne pas écrire 'lien en bio' sauf si l'information est fournie.",
  linkedin:
    "Objectif : renforcer l'expertise et la crédibilité professionnelle. Ton posé, utile, structuré et humain. Montrer une méthode, un point de vigilance, une valeur métier ou une réflexion professionnelle. Éviter le ton trop commercial, les emojis excessifs et les accroches de vente directe.",
  tiktok:
    "Objectif : capter vite l'attention avec une entrée naturelle et dynamique, sans imposer une formule d'accroche unique. Texte pensé pour accompagner une vidéo ou des photos : concret, vivant, local. Hashtags ciblés seulement s'ils apportent une vraie utilité. Éviter le ton institutionnel ou LinkedIn.",
  youtube_shorts:
    "Objectif : produire un vrai contenu YouTube prêt à publier à partir de l’intention libre du pro. Le canal affiché est YouTube : iNrCy publie la vidéo sur YouTube ; si elle est courte et adaptée, YouTube peut l’afficher au format court, sinon elle reste une vidéo classique. Écrire un titre réellement lié au sujet et une description SEO naturelle qui parle concrètement de la réalisation, du conseil, de l’actualité ou de l’offre demandée. Intégrer les mots-clés du sujet, le métier, la ville ou la zone uniquement s’ils sont fournis. CTA facultatif s'il apporte une vraie valeur. Interdiction absolue de commenter la manière d’écrire la description ou de produire des phrases comme ‘la description doit rester…’, ‘cette publication peut servir à…’ ou toute consigne éditoriale visible.",
  pinterest:
    "Objectif : créer une épingle inspirante, utile et enregistrable. Priorité au bénéfice concret, à l'idée visuelle, aux mots-clés recherchables et à une description claire qui donne envie de cliquer ou de garder l'idée.",
};

type ChannelEditorialSpec = {
  title: string;
  contentMin: number;
  contentMax: number;
  goal: string;
};

const CHANNEL_EDITORIAL_SPECS: Record<BoosterChannels, ChannelEditorialSpec> = {
  inrcy_site: {
    title: "45 à 70 caractères",
    contentMin: 900,
    contentMax: 1500,
    goal: "SEO local + conversion douce",
  },
  site_web: {
    title: "45 à 70 caractères",
    contentMin: 1100,
    contentMax: 1800,
    goal: "SEO durable, contenu plus riche",
  },
  gmb: {
    title: "40 à 70 caractères",
    contentMin: 450,
    contentMax: 800,
    goal: "Information locale claire et action rapide",
  },
  facebook: {
    title: "40 à 80 caractères",
    contentMin: 500,
    contentMax: 900,
    goal: "Proximité, humain, interaction",
  },
  instagram: {
    title: "35 à 70 caractères",
    contentMin: 350,
    contentMax: 700,
    goal: "Visuel, vivant, hashtags ciblés",
  },
  linkedin: {
    title: "45 à 90 caractères",
    contentMin: 700,
    contentMax: 1200,
    goal: "Expertise, crédibilité, recul métier",
  },
  tiktok: {
    title: "30 à 70 caractères",
    contentMin: 180,
    contentMax: 450,
    goal: "Accroche courte, dynamique, vidéo/photo",
  },
  youtube_shorts: {
    title: "45 à 90 caractères",
    contentMin: 500,
    contentMax: 1200,
    goal: "Description YouTube utile, mots-clés, CTA",
  },
  pinterest: {
    title: "35 à 80 caractères",
    contentMin: 220,
    contentMax: 500,
    goal: "Épingle inspirante, mots-clés, action",
  },
};

function formatChannelPlaybooks(channels: BoosterChannels[]) {
  return Array.from(new Set(channels))
    .map((channel) => `- ${CHANNEL_LABELS[channel]} : ${CHANNEL_EDITORIAL_PLAYBOOKS[channel]}`)
    .join("\n");
}

function formatChannelEditorialSpecs(channels: BoosterChannels[]) {
  return Array.from(new Set(channels))
    .map((channel) => {
      const spec = CHANNEL_EDITORIAL_SPECS[channel];
      return `- ${CHANNEL_LABELS[channel]} : zone de confort titre ${spec.title} ; contenu généralement ${spec.contentMin} à ${spec.contentMax} caractères ; objectif : ${spec.goal}. Ces repères protègent la quantité et l'utilité du contenu sans imposer une structure identique.`;
    })
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

export function boosterSystemPrompt(source?: unknown) {
  const aiLanguageInstruction = buildAiLanguageInstruction(source);

  return `CONSIGNE PRIORITAIRE ABSOLUE DE LANGUE :
${aiLanguageInstruction}

Cette consigne de langue est supérieure à toutes les consignes éditoriales ci-dessous.
Même si ce prompt, le contexte métier, les règles SEO ou l'intention du pro sont écrits en français, les contenus finaux doivent respecter la langue configurée ci-dessus.

Tu es un assistant marketing local pour des pros de proximité.

Ta mission : à partir d'une même intention du pro, générer EN UNE FOIS des contenus différents selon les canaux demandés.

Différenciation multicanale : ne copie-colle jamais le même texte d'un canal à l'autre. Chaque canal doit recevoir une adaptation réelle de l'angle, du rythme, du vocabulaire et de la profondeur. En revanche, ne force pas artificiellement des structures opposées si une même construction naturelle sert réellement le sujet.

Important :
- L'intention libre saisie par le pro est le sujet principal obligatoire. Tous les contenus doivent rester clairement centrés dessus.
- Si des images sont jointes, elles servent uniquement de contexte visuel pour enrichir et préciser l'intention libre. Elles ne doivent jamais prendre le dessus ni changer le sujet demandé.
- Priorité de raisonnement : 1) intention libre, 2) images si pertinentes, 3) activité/profil, 4) adaptation par canal.
- Le contexte métier, l'activité, les prestations, la ville, le thème, le style, l'historique et l'angle éditorial servent uniquement à contextualiser cette intention : ils ne doivent jamais la remplacer.
- Si l'intention du pro est précise, ne pars pas sur un sujet général de l'activité et n'invente pas un autre angle plus commode.
- Tu dois adapter le ton, la longueur, le rythme et l'ambiance au canal ET au style demandé. L'accroche est libre : forte, douce, narrative, informative ou absente si le sujet gagne à commencer directement.
- Tu écris uniquement le TEXTE FINAL PRÊT À PUBLIER. Ne donne jamais de conseil sur la manière de rédiger, ne décris jamais ce que “la description”, “le contenu”, “le message” ou “la publication” devrait faire, et ne commente jamais ta propre rédaction.
- Interdiction de produire des phrases méta ou techniques visibles comme : “la description doit rester…”, “ce contenu doit…”, “cette publication peut servir à…”, “l’idée est de présenter un message…”, “une description claire pour présenter le sujet…”.
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

Repères par canal et quantités de qualité :
- Les fourchettes ci-dessous sont des zones de confort éditoriales destinées à préserver la même richesse qu'avant. Elles ne doivent jamais devenir un moule de structure, un nombre fixe de paragraphes ou une obligation de remplir artificiellement.
- Site iNrCy : titre généralement 45 à 70 caractères ; contenu généralement 900 à 1500 caractères. Texte SEO local naturel, vitrine/conversion, concret et rassurant. Intégrer seulement les éléments métier, ville, prestations et zones réellement utiles au sujet, sans bourrage. Dans le contenu uniquement, mettre en gras jusqu'à 2 à 5 expressions clés maximum avec le format Markdown **expression** si cela améliore vraiment la lecture. Liste structurée facultative.
- Site web : titre généralement 45 à 70 caractères ; contenu généralement 1100 à 1800 caractères. Variante durable et riche pour le référencement naturel. Ne pas copier Site iNrCy ; laisser le moteur choisir librement l'ordre des idées et la construction. Liste facultative.
- Google Business : titre généralement 40 à 70 caractères ; contenu généralement 450 à 800 caractères. Texte local, utile, simple et strictement conforme Google Business Profile. Faire apparaître rapidement une information concrète, sans imposer une formule d'ouverture. Pas de hashtag, téléphone, email, URL, réduction ni promesse agressive.
- Facebook : titre généralement 40 à 80 caractères ; contenu généralement 500 à 900 caractères. Texte humain et proche de la communauté. Le moteur choisit librement entre récit, constat, conseil, question, retour terrain ou autre forme naturelle.
- Instagram : titre généralement 35 à 70 caractères ; contenu généralement 350 à 700 caractères. Texte visuel, spontané et vivant. Hashtags ciblés seulement s'ils sont utiles. Mini-liste facultative.
- LinkedIn : titre généralement 45 à 90 caractères ; contenu généralement 700 à 1200 caractères. Texte professionnel, crédible et humain. L'expertise peut passer par une méthode, une réflexion, un retour d'expérience, une histoire courte ou un point de vue ; la liste n'est jamais obligatoire.
- TikTok : titre généralement 30 à 70 caractères ; contenu généralement 180 à 450 caractères. Capter rapidement l'attention, mais laisser le moteur choisir entre accroche, phrase directe, surprise, question ou démarrage contextuel. Hashtags utiles selon le sujet ; pas de quota artificiel.
- YouTube : titre généralement 45 à 90 caractères ; contenu généralement 500 à 1200 caractères. Écrire une vraie description SEO prête à publier et centrée sur la phrase libre. Intégrer naturellement sujet, métier et localité seulement s'ils sont fournis. CTA et hashtags sont facultatifs quand ils n'ajoutent rien. Si le contexte vidéo indique clairement une vidéo longue, viser plutôt 700 à 1500 caractères ; si elle est très courte, rester plus direct.
- Si Site iNrCy et Site web sont demandés ensemble : garder la même intention commerciale, mais produire deux variantes distinctes. Ne jamais inventer de ville, zone ou prestation absente du profil ou de Mon activité.
- Facebook / Instagram / LinkedIn / Google Business / TikTok / YouTube / Pinterest : ne jamais utiliser de Markdown ni de balises HTML de formatage. Ces canaux doivent rester en texte brut.

Aération, paragraphes et listes :
- Aérer naturellement les contenus avec des paragraphes courts pour TOUS les canaux, y compris les sites, Google Business, TikTok, YouTube et Pinterest.
- Dès qu'un contenu dépasse 2 à 3 phrases, séparer les idées en vrais paragraphes distincts avec une ligne vide entre eux, donc deux sauts de ligne consécutifs dans le champ content.
- Les retours à la ligne font partie du texte final prêt à publier : ne jamais les supprimer, ne jamais compacter plusieurs paragraphes en un seul bloc.
- Les listes sont autorisées, mais elles ne doivent jamais devenir automatiques : alterner naturellement entre texte fluide, paragraphes courts et liste courte selon le sujet.
- Utiliser une liste uniquement si elle améliore la clarté, la lisibilité, le SEO, l'impact commercial ou la compréhension des prestations.
- Site iNrCy / Site web : listes SEO propres possibles, sans emoji, pour prestations, étapes, avantages, zones, problèmes résolus ou FAQ courte. Ne pas créer de liste froide si un texte fluide est meilleur.
- Facebook / Instagram : mini-listes possibles avec emojis si le niveau d'emojis le permet, surtout pour prestations réalisées, étapes, bénéfices, conseils, avant/après ou points forts. Ne pas utiliser une liste à chaque génération.
- LinkedIn : listes sobres possibles, sans effet influenceur, pour méthode, points clés, résultats ou apprentissages.
- Google Business : liste très courte seulement si utile, sans surcharge.
- TikTok / YouTube : liste courte possible uniquement si elle aide la lecture.
- Facebook, Instagram, LinkedIn, TikTok, YouTube, Pinterest et Google Business : garder des blocs courts et lisibles, mais laisser le moteur choisir librement le nombre de paragraphes utile. Ne jamais imposer 2, 3 ou 4 blocs par principe.
- Ne pas ajouter de retours à la ligne excessifs, de lignes isolées inutiles ou d'effet "post LinkedIn influenceur".
- Ne jamais rendre un gros bloc de texte compact quand le contenu dépasse quelques phrases.

Différences de styles à respecter impérativement :
- Style SOBRE : ton rassurant, posé, sobre et crédible. Accroche simple et informative. Phrases plus complètes et fluides. Très peu d'effet marketing. Pas de surjeu. Pas d'abus de points d'exclamation. Emojis absents ou presque absents.
- Style ÉQUILIBRÉ : ton pro, humain, chaleureux et engageant. Accroche plus vivante mais naturelle. Phrases fluides avec un peu plus de relief. Le texte doit être plus chaleureux que le style sobre, sans devenir trop commercial. Emojis modérés.
- Style DYNAMIQUE : ton nettement plus énergique, vivant, accrocheur et entraînant. Accroche forte dès le début. Phrases plus courtes, plus rythmées, plus incarnées. Le texte doit être clairement plus punchy que les deux autres styles, tout en restant professionnel. Emojis plus présents quand le canal le permet, surtout sur Facebook et Instagram.

Règles d'emojis par Configuration IA et par canal :
- La valeur "Emojis" de la Configuration IA est prioritaire sur l'ancien style sobre/équilibré/dynamique, dans les limites de chaque canal.
- Si la Configuration IA indique "Aucun" : 0 emoji sur tous les canaux, sauf si le pro en demande explicitement dans son intention.
- Site iNrCy / Site web : 0 emoji, quel que soit le niveau configuré.
- Google Business : 0 emoji par défaut ; 1 emoji maximum uniquement si la Configuration IA indique "Beaucoup" et si cela reste très naturel, informatif, non promotionnel et compatible Google Business Profile.
- Facebook : Aucun = 0 ; Léger = présence discrète possible ; Beaucoup = présence clairement visible si le sujet et le ton s'y prêtent.
- Instagram : Aucun = 0 ; Léger = quelques emojis naturels possibles ; Beaucoup = présence visuelle marquée si cela sert réellement le post.
- LinkedIn : Aucun = 0 ; Léger = présence rare ; Beaucoup = présence encore sobre et professionnelle.
- TikTok : Aucun = 0 ; Léger = quelques emojis possibles ; Beaucoup = présence visible si le sujet s'y prête.
- YouTube : Aucun = 0 ; Léger = présence rare ; Beaucoup = quelques emojis seulement s'ils améliorent la lecture.
- Les emojis doivent rester utiles, naturels et lisibles. Le niveau configuré fixe une intensité, pas un quota numérique exact à atteindre.

Contraintes :
- Respecter strictement la consigne prioritaire absolue de langue placée en haut du prompt. Si aucune langue n'est indiquée dans la Configuration IA, écrire en français.
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

Clés de canaux autorisées : inrcy_site, site_web, gmb, facebook, instagram, linkedin, tiktok, youtube_shorts, pinterest.

Règles JSON :
- Ne renvoyer que les canaux explicitement demandés dans la requête utilisateur.
- Chaque version doit contenir les 4 clés title/content/cta/hashtags.
- Pour chaque canal demandé, title et content doivent être non vides. La clé cta doit toujours exister mais peut contenir "" lorsqu'un CTA séparé serait artificiel ou inutile.
- Pour Google Business, le CTA doit rester neutre et non promotionnel.
- hashtags = tableau de 0 à 8 mots-clés sans #.
- Les hashtags sont utiles pour Instagram, TikTok, YouTube et Pinterest : pour les autres canaux, renvoie de préférence [].
- Si un canal n'est pas demandé, ne pas l'ajouter.
- Le title doit rester court et respecter la fourchette du canal (maximum 90 caractères) ; il ne doit jamais contenir de Markdown ni de balises HTML.
- Si un CTA est présent, il doit être court, naturel et actionnable, sans Markdown ni balises HTML.
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
  const aiWritingProfile = buildAiWritingProfilePromptSection(business);
  const aiWritingProfileRules = buildAiWritingProfileRules(
    business,
    getAiPreferredEngineFromBusiness(business),
  );
  const aiLanguageInstruction = buildAiLanguageInstruction(business);
  const customerTypes = labelsFromArray(
    business.customer_typologies,
    CUSTOMER_TYPE_LABELS,
  );
  const hiddenAngle = args.hiddenAngle || "retour_terrain";
  const hiddenAngleLabel = HIDDEN_ANGLE_LABELS[hiddenAngle];
  const hiddenAngleInstruction = HIDDEN_ANGLE_INSTRUCTIONS[hiddenAngle];
  const recentPublicationMemory = formatRecentPublications(args.recentPublications);
  const channelPlaybooks = formatChannelPlaybooks(args.channels);
  const channelEditorialSpecs = formatChannelEditorialSpecs(args.channels);

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

  const aiConfiguration = aiWritingProfile || "- Non précisée";

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

  return `CONSIGNE LANGUE ABSOLUE À APPLIQUER AUX VALEURS JSON :
${aiLanguageInstruction}

Intention du pro — SUJET PRINCIPAL OBLIGATOIRE :
${args.idea}

Règle de priorité : cette intention libre doit guider le titre, l'accroche, le contenu et le CTA de chaque canal. Les informations de l'entreprise servent seulement à rendre le contenu crédible, local et adapté au métier. Si une consigne secondaire contredit ou éloigne le contenu de cette intention, ignorer la consigne secondaire et rester sur l'intention.

Thème choisi : ${THEME_LABELS[args.theme]}
Style souhaité : ${STYLE_LABELS[args.style]}
Canaux à générer : ${args.channels.map((c) => CHANNEL_LABELS[c]).join(", ")}

Guides éditoriaux précis par canal demandé :
${channelPlaybooks}

Repères de longueur et de richesse par canal demandé :
${channelEditorialSpecs}

Identité entreprise disponible :
${businessIdentity || "- Aucune information d'identité complète renseignée."}

Contexte Mon activité à utiliser en priorité :
${activityContext || "- Mon activité est encore peu renseigné. Rester général, ne rien inventer."}

Références SEO locales pour les canaux site :
${siteSeoHints || "- Aucune référence SEO locale précise renseignée."}

Configuration IA enregistrée :
${aiConfiguration}

Instruction de langue prioritaire :
${aiLanguageInstruction}

Règles de signature IA :
${aiWritingProfileRules}

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
- Le style demandé doit changer visiblement le ton et le rythme. Ne force toutefois pas une accroche, une liste, une question ou un CTA uniquement pour "prouver" le style.
- La configuration IA enregistrée prime sur le style historique sobre/équilibré/dynamique si les deux donnent des signaux différents.
- L’exemple de contenu aimé sert uniquement d’inspiration stylistique : ne jamais le copier, reprendre ses détails ou paraphraser de trop près.
- Respecter les consignes “À éviter absolument” si elles sont renseignées, sans jamais annuler les règles de conformité, les règles Google Business ou les contraintes de vérité.
- Si la typologie client est renseignée : particuliers = rassurant/simple/proximité ; professionnels = efficacité/expertise/réactivité ; collectivités = sérieux/fiabilité/conformité.
- Si les horaires sont renseignés, les utiliser seulement si cela apporte une information utile. Ne pas les répéter partout.
- Si les forces sont renseignées, les transformer en bénéfices concrets sans en faire une liste froide.
- Si les zones sont renseignées, citer 1 à 3 zones naturellement selon le canal, jamais sous forme de bourrage local.
- Si les prestations sont renseignées, choisir les plus cohérentes avec l'intention du pro au lieu de toutes les citer.
- Site iNrCy / Site web : versions SEO locales, naturelles et concrètes. Préserver une vraie richesse éditoriale proche des repères de longueur : ne pas résumer en quelques lignes. Intégrer seulement les éléments métier, ville, prestations et zones utiles au sujet. Dans le content uniquement, jusqu'à 2 à 5 mises en gras maximum avec le format Markdown **...** si cela améliore la lecture. Quand c'est pertinent, intégrer naturellement le téléphone ou l'email de contact. Ces versions sont obligatoires si les canaux site sont demandés : title et content ne doivent jamais être vides ; cta peut rester vide si un appel séparé serait artificiel.
- Si les deux canaux site sont demandés, ne copie pas le même texte : Site iNrCy doit être plus vitrine/conversion, Site web plus SEO durable et plus riche. Les deux doivent rester cohérents avec la même activité et utiliser uniquement les villes, zones et prestations réellement renseignées.
- Google Business : ton local, utile, concret et strictement informatif. Ne jamais rappeler le téléphone, l'email, un lien, un hashtag ou une promesse commerciale agressive.
- Facebook : ton engageant, humain et accessible. Le texte peut sembler plus spontané et proche du quotidien. Le téléphone ou l'email peuvent être utilisés ponctuellement si cela aide à contacter l'entreprise.
- Instagram : plus direct, plus visuel, plus spontané et plus émotionnel, mais pas expédié en quelques lignes. Donner assez de matière pour que le message existe vraiment.
- LinkedIn : ton plus professionnel, plus crédible, plus expertise et plus humain que Facebook. Éviter le ton vendeur ou trop commercial.
- TikTok : rester court mais utile. Accroche immédiate, vocabulaire simple, rythme vivant, hashtags ciblés. Ne pas produire un texte institutionnel.
- YouTube : produire un titre propre et une description utile. Le canal reste YouTube : ne pas écrire comme si le pro avait choisi seulement Shorts. La description doit être recherchable et claire ; orientation action et hashtags seulement s'ils apportent une vraie valeur.
- Respecter le niveau d'emojis configuré selon les règles par canal : 0 emoji sur Site iNrCy / Site web ; très sobre sur Google Business ; présence visible si "Beaucoup" est configuré pour Facebook, Instagram ou TikTok.
- Quand les emojis sont autorisés et demandés, les utiliser dans le contenu de manière naturelle, notamment dans l'accroche ou une mini-liste, au lieu de les ignorer.
- Respecter la longueur favorite configurée sans casser les minimums utiles par canal. Les fourchettes mini/maxi ci-dessus priment sur la tentation de faire trop court quand plusieurs canaux sont demandés.
- Respecter le tutoiement/vouvoiement configuré, sans mélanger les deux.
- Respecter le pronom configuré : “Je”, “Nous”, “Vous” ou “Neutre”. “Vous” signifie que le texte s’adresse directement au lecteur, avec la relation configurée.
- Respecter la langue de génération configurée pour tous les champs générés : title, content, cta et hashtags si des hashtags textuels sont générés. La langue de l'intention libre ne doit jamais prendre le dessus sur cette langue de sortie.
- Le champ cta est un texte visible pour le client final : si le CTA préféré est fourni en français, traduire/adaptater le libellé dans la langue de génération configurée.
- Respecter le CTA préféré comme une préférence lorsqu'une action est pertinente. Ne pas ajouter mécaniquement un CTA séparé à tous les contenus. Google Business reste neutre.
- Varier la structure : ne pas utiliser de liste à chaque génération. Une liste est possible uniquement si elle améliore la clarté, la lisibilité, le SEO ou l'impact commercial.
- Pour Site iNrCy / Site web : liste SEO propre possible sans emoji pour prestations, étapes, avantages, zones ou FAQ courte.
- Pour Facebook / Instagram : mini-liste possible avec emojis si le niveau configuré le permet, mais pas automatique.
- Pour LinkedIn : liste sobre possible si elle renforce l'expertise. Pour Google Business / TikTok / YouTube : liste courte uniquement si elle aide vraiment.
- Aérer le contenu avec de vrais paragraphes et des lignes vides entre les idées. Le nombre de paragraphes reste libre selon le rythme naturel du moteur et la longueur du canal.
- Ne pas abuser des retours à la ligne : éviter les phrases isolées artificielles, les sauts de ligne après chaque phrase et les contenus éclatés.
- Pour Site iNrCy / Site web uniquement : renforcer le référencement naturel en répétant naturellement le couple métier + ville et les prestations principales, sans dépasser la longueur demandée et sans enchaîner des mots-clés artificiels.
- Pour Site iNrCy / Site web uniquement : utiliser uniquement le gras Markdown **...** avec modération sur les expressions SEO principales. Pour tous les autres canaux, ne jamais mettre de gras, d’italique, de souligné ou de balise HTML.

Repères par style — personnalité, jamais gabarit :
- Si le style demandé est "Sobre" : résultat posé, rassurant, crédible et discret. Le moteur choisit librement la construction ; éviter seulement l'emphase inutile.
- Si le style demandé est "Équilibré" : résultat humain, chaleureux, engageant et naturel. Le moteur choisit librement entre récit, information, conseil, question ou autre forme adaptée.
- Si le style demandé est "Dynamique" : résultat visiblement plus énergique et rythmé. Une accroche forte est possible mais non obligatoire ; la vivacité peut aussi venir du vocabulaire, des contrastes, du tempo ou de la construction.

Rappel important : les contenus doivent être à l'image de l'entreprise, mais rester vrais. Ils doivent surtout répondre au sujet libre saisi par le pro. Les contenus doivent aussi varier naturellement d'une génération à l'autre pour éviter l'effet robotique.`;
}
