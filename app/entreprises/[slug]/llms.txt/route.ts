import { loadInrSearchPublicPage, buildInrSearchPublicUrl } from "@/lib/inrSearchPublic";

export const revalidate = 300;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function list(values: string[]) {
  return values.map(clean).filter(Boolean).map((value) => `- ${value}`).join("\n");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const data = await loadInrSearchPublicPage(slug);
  if (!data) return new Response("Profil introuvable\n", { status: 404 });

  const url = buildInrSearchPublicUrl(data.slug);
  const sections = [
    `# ${data.companyName}`,
    "",
    `> Profil professionnel vérifié et publié par iNrCy : ${url}`,
    "",
    "## Identité",
    `- Activité : ${clean(data.profession || data.sectorLabel) || "Non renseignée"}`,
    `- Ville : ${clean(data.city) || "Non renseignée"}`,
    `- Pays : ${clean(data.country) || "France"}`,
    data.description || data.pageDescription
      ? `- Présentation : ${clean(data.description || data.pageDescription)}`
      : "",
    "",
    data.services.length ? "## Prestations\n" + list(data.services) : "",
    data.zones.length ? "## Zone d’intervention\n" + list(data.zones) : "",
    data.customerTypes.length ? "## Publics accompagnés\n" + list(data.customerTypes) : "",
    data.strengths.length ? "## Points forts\n" + list(data.strengths) : "",
    data.faq.length
      ? `## Questions fréquentes\n${data.faq.map((item) => `### ${clean(item.question)}\n${clean(item.answer)}`).join("\n\n")}`
      : "",
    data.publications.length
      ? `## Actualités\n${data.publications.map((item) => `### ${clean(item.title)}\n${clean(item.content)}`).join("\n\n")}`
      : "",
    "## Contact",
    data.phone ? `- Téléphone : ${clean(data.phone)}` : "",
    data.email ? `- Email : ${clean(data.email)}` : "",
    data.addressLine || data.address ? `- Adresse : ${clean(data.addressLine || data.address)}` : "",
    data.openingDays || data.openingHours
      ? `- Horaires : ${[data.openingDays, data.openingHours].filter(Boolean).map(clean).join(" — ")}`
      : "",
    "",
    "## Source et fraîcheur",
    `- Source : ${url}`,
    data.updatedAt ? `- Dernière mise à jour : ${clean(data.updatedAt)}` : "",
    "- Les informations de ce document proviennent des données publiées par le professionnel dans iNrCy.",
  ].filter(Boolean);

  return new Response(`${sections.join("\n")}\n`, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
