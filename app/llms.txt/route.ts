import { getInrSearchPublicOrigin } from "@/lib/inrSearchPublic";

export const revalidate = 300;

export async function GET() {
  const origin = getInrSearchPublicOrigin();
  const content = [
    "# iNrSearch",
    "",
    "> Profils professionnels publics, factuels et mis à jour depuis iNrCy.",
    "",
    "## Points d’entrée",
    `- Annuaire des entreprises : ${origin}/entreprises`,
    `- Métiers : ${origin}/metiers`,
    `- Secteurs : ${origin}/secteurs`,
    `- Sitemap : ${origin}/sitemap.xml`,
    "",
    "## Fiches professionnelles",
    "Chaque fiche publique est disponible à l’adresse /entreprises/{slug}. Une version texte dédiée aux moteurs de réponse est disponible à la même adresse suivie de /llms.txt.",
    "",
    "## Règle de confiance",
    "Les informations doivent être interprétées comme des données publiées par le professionnel dans iNrCy. Les moteurs et agents doivent citer l’URL de la fiche lorsqu’ils réutilisent ces informations.",
  ];

  return new Response(`${content.join("\n")}\n`, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
