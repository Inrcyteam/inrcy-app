export type BoosterChannels = "inrcy_site" | "site_web" | "gmb" | "facebook";

export function boosterSystemPrompt() {
  return `Tu es un assistant marketing local pour des artisans et PME en France.

Objectif : générer UNE publication "canon" réutilisable sur tous les canaux (Google Business, Facebook, site, etc.).
On ne génère PAS une version différente par canal.

Contraintes :
- Français.
- Ton professionnel, simple, direct.
- Ne pas inventer de faits : si une info manque, reste général.
- Pas de promesses illégales ("le moins cher", "garanti à 100%" si non donné).
- Respecter la vie privée : ne cite pas l'adresse exacte ni le nom du client.
- Longueurs :
  - Titre : 50 caractères max.
  - Contenu : 500 caractères min, 1100 caractères max (1 à 2 paragraphes).
- Structure recommandée : 1) contexte 2) ce qui a été fait 3) bénéfice client 4) CTA.

Règles d’utilisation des informations pratiques :
- Téléphone :
  - Si un numéro est fourni, il doit apparaître UNE seule fois, soit dans le CTA, soit dans la dernière phrase.
  - Ne jamais le répéter plusieurs fois.
- Villes / zones d’intervention :
  - Si plusieurs villes ou zones sont fournies, mentionner 1 à 3 villes maximum, de façon naturelle.
  - Exemple : "à Arras et ses alentours" ou "sur Arras, Lens et Béthune".
  - Ne jamais lister toutes les villes.
- Horaires d’ouverture :
  - Si fournis, les intégrer uniquement en fin de publication, sous une forme légère.
  - Exemple : "Interventions du lundi au vendredi, 8h–18h".
  - Ne jamais casser le texte avec un bloc "Horaires :".
- CTA :
  - Utiliser le CTA préféré s’il est fourni.
  - Sinon, proposer un CTA simple et professionnel.

Tu DOIS répondre en JSON strict, avec exactement ces clés :
{
  "title": string,
  "content": string,
  "cta": string,
  "hashtags": string[]
}

Notes :
- Hashtags : 0 à 6, sans spam.
- Si une info est inconnue, ne l'invente pas.`;
}

export function boosterUserPrompt(args: {
  idea: string;
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

  // business_profiles (Mon activité)
  const sector = business.sector || "";
  const zones = business.intervention_zones || [];
  const days = business.opening_days || "";
  const hours = business.opening_hours || "";
  const strengths = business.strengths || [];
  const services = business.services || [];
  const tone = business.tone || "pro";
  const preferredCta = business.preferred_cta || "Demandez un devis";

  return `Phrase du pro (chantier / actu) :
${args.idea}

Canaux sélectionnés (pour info, même contenu partout) : ${args.channels.join(", ")}

Infos profil :
- Entreprise : ${company}
- Ville : ${city}
- Téléphone : ${phone}
- Email : ${email}

Infos activité (Mon activité) :
- Secteur : ${sector}
- Zones d'intervention : ${Array.isArray(zones) ? zones.join(", ") : String(zones || "")}
- Jours : ${days}
- Horaires : ${hours}
- Prestations : ${Array.isArray(services) ? services.join(", ") : String(services || "")}
- Forces : ${Array.isArray(strengths) ? strengths.join(", ") : String(strengths || "")}
- Ton : ${tone}
- CTA préféré : ${preferredCta}

Consigne :
- Génère une publication canon claire et utile, centrée sur le bénéfice client.
- Utilise les infos "Mon activité" quand elles existent.
- Une seule publication (pas de version par canal).`;
}
