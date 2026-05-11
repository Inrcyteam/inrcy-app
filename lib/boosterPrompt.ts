import { decodeBusinessSector, getActivitySectorLabel } from "@/lib/activitySectors";

export type BoosterChannels =
  | "inrcy_site"
  | "site_web"
  | "gmb"
  | "facebook"
  | "instagram"
  | "linkedin";

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

const CHANNEL_LABELS: Record<BoosterChannels, string> = {
  inrcy_site: "Site iNrCy",
  site_web: "Site web",
  gmb: "Google Business",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
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

export function boosterSystemPrompt() {
  return `Tu es un assistant marketing local pour des pros de proximité en France.

Ta mission : à partir d'une même intention du pro, générer EN UNE FOIS des contenus différents selon les canaux demandés.

Important :
- Tu dois adapter le ton, la longueur, le rythme, l'accroche et l'ambiance au canal ET au style demandé.
- Tu ne dois pas inventer de faits précis si l'information n'est pas fournie.
- Tu peux reformuler, structurer et enrichir légèrement, mais sans mentir.
- Tu dois tenir compte du secteur, du métier, des prestations, de la ville et du thème choisi.
- Les trois styles (sobre, équilibré, dynamique) doivent produire des textes VISIBLEMENT différents. Pas de simples nuances.

Règles par canal :
- Site iNrCy / Site web : texte SEO local de 180 à 320 mots, sans rallonger inutilement. Intégrer naturellement le métier principal, la ville, 2 à 4 prestations, 1 à 3 zones d'intervention et des variantes de mots-clés proches. Remplacer les phrases vagues par des phrases utiles au référencement. Pour le contenu uniquement, mettre en gras 2 à 5 expressions clés maximum avec le format Markdown **expression** (métier + ville, prestation, zone). Ne jamais mettre une phrase entière en gras et ne jamais faire de liste brute de mots-clés.
- Google Business : texte local, utile, simple, environ 80 à 140 mots, strictement conforme aux règles Google Business Profile.
- Facebook : texte engageant, clair, avec un peu plus de matière, environ 80 à 160 mots.
- Instagram : texte visuel, direct et vivant, mais avec assez de matière pour donner du relief, environ 70 à 140 mots, hashtags utiles.
- LinkedIn : texte plus professionnel, crédible et structuré, environ 100 à 220 mots.
- Facebook / Instagram / LinkedIn / Google Business : ne jamais utiliser de Markdown ni de balises HTML de formatage. Ces canaux doivent rester en texte brut.

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
- Ton pro, humain, local, simple.
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
    "inrcy_site": { "title": string, "content": string, "cta": string, "hashtags": string[] },
    "site_web": { "title": string, "content": string, "cta": string, "hashtags": string[] },
    "gmb": { "title": string, "content": string, "cta": string, "hashtags": string[] },
    "facebook": { "title": string, "content": string, "cta": string, "hashtags": string[] },
    "instagram": { "title": string, "content": string, "cta": string, "hashtags": string[] },
    "linkedin": { "title": string, "content": string, "cta": string, "hashtags": string[] }
  }
}

Règles JSON :
- Ne renvoyer que les canaux demandés.
- Chaque version doit contenir les 4 clés title/content/cta/hashtags.
- Pour chaque canal demandé, title, content et cta doivent être non vides.
- Pour Google Business, le CTA doit rester neutre et non promotionnel.
- hashtags = tableau de 0 à 8 mots-clés sans #.
- Les hashtags ne sont réellement utiles que pour Instagram : pour les autres canaux, renvoie de préférence [].
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
}) {
  const profile = args.profile || {};
  const business = args.business || {};

  const company = profile.company_legal_name || profile.companyLegalName || "";
  const city = profile.hq_city || profile.hqCity || "";
  const phone = profile.phone || "";
  const email = profile.contact_email || profile.contactEmail || "";

  const decodedSector = decodeBusinessSector(business.sector || "");
  const profession = decodedSector.profession || "";
  const sectorCategory = getActivitySectorLabel(decodedSector.sectorCategory);
  const zones = business.intervention_zones || [];
  const days = business.opening_days || "";
  const hours = business.opening_hours || "";
  const strengths = business.strengths || [];
  const services = business.services || [];
  const tone = business.tone || "pro";
  const preferredCta = business.preferred_cta || "Demandez un devis";

  return `Intention du pro :
${args.idea}

Thème choisi : ${THEME_LABELS[args.theme]}
Style souhaité : ${STYLE_LABELS[args.style]}

Canaux à générer : ${args.channels.map((c) => CHANNEL_LABELS[c]).join(", ")}

Infos profil :
- Entreprise : ${company}
- Ville : ${city}
- Téléphone : ${phone}
- Email : ${email}

Infos activité :
- Secteur d'activité : ${sectorCategory}
- Métier : ${profession}
- Prestations cochées : ${Array.isArray(services) ? services.join(", ") : String(services || "")}
- Zones d'intervention : ${Array.isArray(zones) ? zones.join(", ") : String(zones || "")}
- Jours : ${days}
- Horaires : ${hours}
- Forces : ${Array.isArray(strengths) ? strengths.join(", ") : String(strengths || "")}
- Ton : ${tone}
- CTA préféré : ${preferredCta}

Consignes supplémentaires :
- Adapter clairement le contenu à chaque canal demandé.
- Le style demandé doit changer visiblement le ton, les accroches, le rythme des phrases et la présence d'emojis. Ne fais pas seulement une variation légère.
- Site iNrCy / Site web : version SEO locale, naturelle et concrète. Garder une longueur proche de la version actuelle : ne pas allonger le contenu, densifier plutôt les phrases existantes. Intégrer plus souvent, mais sans bourrage, le métier exact, la ville, les prestations cochées, les zones d'intervention et leurs variantes sémantiques. Dans le content uniquement, ajoute 2 à 5 mises en gras maximum avec le format Markdown **...** sur des expressions importantes, jamais sur une phrase complète. Quand c'est pertinent, intégrer naturellement le téléphone ou l'email de contact. Cette version est obligatoire si le canal site est demandé : ne jamais laisser title/content/cta vides.
- Instagram : plus direct, plus visuel, mais pas expédié en quelques lignes. Donner assez de matière pour que le message existe vraiment.
- LinkedIn : ton plus professionnel, plus structuré et plus développé que Facebook.
- Google Business : ton local, utile, concret et strictement informatif. Ne jamais rappeler le téléphone, l'email, un lien, un hashtag ou une promesse commerciale agressive.
- Facebook : ton engageant et accessible. Le téléphone ou l'email peuvent être utilisés ponctuellement si cela aide à contacter l'entreprise.
- Utiliser en priorité le métier exact et les prestations cochées quand elles existent.
- Pour Site iNrCy / Site web uniquement : renforcer le référencement naturel en répétant naturellement le couple métier + ville et les prestations principales, sans dépasser la longueur demandée et sans enchaîner des mots-clés artificiels.
- Pour Site iNrCy / Site web uniquement : utiliser uniquement le gras Markdown **...** avec modération sur les expressions SEO principales. Pour tous les autres canaux, ne jamais mettre de gras, d’italique, de souligné ou de balise HTML.

Exigences précises par style :
- Si le style demandé est "Sobre" : produire un texte clairement posé, rassurant, crédible et discret. Accroche simple. Peu d'effets. Phrases plutôt complètes. Zéro emphase inutile. Emojis absents ou quasi absents selon le canal.
- Si le style demandé est "Équilibré" : produire un texte humain, chaleureux, engageant et naturel. Accroche plus vivante. Phrases fluides avec du relief. Emojis modérés selon le canal.
- Si le style demandé est "Dynamique" : produire un texte visiblement plus punchy et entraînant. Commencer par une accroche plus forte. Utiliser des phrases plus rythmées et plus courtes quand c'est pertinent. Sur Facebook et Instagram, autoriser une présence d'emojis plus marquée que dans les autres styles, tout en restant lisible et professionnel.

Rappel important : les trois styles doivent être nettement différents à la lecture.`;
}
