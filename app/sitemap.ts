import type { MetadataRoute } from "next";
import {
  buildInrSearchProfessionUrl,
  buildInrSearchPublicUrl,
  buildInrSearchSectorUrl,
  getInrSearchPublicOrigin,
  listInrSearchCitiesForProfession,
  listInrSearchProfessions,
  listInrSearchSectors,
  listPublishedInrSearchCompanies,
  type PublishedInrSearchCompany,
} from "@/lib/inrSearchPublic";

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestCompanyDate(companies: PublishedInrSearchCompany[]) {
  const dates = companies
    .map((company) => validDate(company.updatedAt))
    .filter((date): date is Date => Boolean(date));
  if (!dates.length) return undefined;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getInrSearchPublicOrigin();
  const [companies, professions, sectors] = await Promise.all([
    listPublishedInrSearchCompanies(),
    listInrSearchProfessions(),
    listInrSearchSectors(),
  ]);

  if (!companies.length) return [];

  const professionCities = await Promise.all(
    professions.map(async (profession) => ({
      profession,
      cities: await listInrSearchCitiesForProfession(profession.slug),
    })),
  );
  const globalLastModified = latestCompanyDate(companies);

  return [
    { url: `${origin}/entreprises`, lastModified: globalLastModified, changeFrequency: "daily", priority: 0.8 },
    { url: `${origin}/metiers`, lastModified: globalLastModified, changeFrequency: "daily", priority: 0.75 },
    { url: `${origin}/secteurs`, lastModified: globalLastModified, changeFrequency: "daily", priority: 0.75 },
    ...professions.map((profession) => {
      const related = companies.filter((company) => company.professionSlug === profession.slug);
      return {
        url: buildInrSearchProfessionUrl(profession.slug),
        lastModified: latestCompanyDate(related),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      };
    }),
    ...professionCities.flatMap(({ profession, cities }) => cities.map((city) => {
      const related = companies.filter((company) => company.professionSlug === profession.slug && company.citySlug === city.slug);
      return {
        url: buildInrSearchProfessionUrl(profession.slug, city.slug),
        lastModified: latestCompanyDate(related),
        changeFrequency: "weekly" as const,
        priority: 0.65,
      };
    })),
    ...sectors.map((sector) => {
      const related = companies.filter((company) => company.sectorSlug === sector.slug);
      return {
        url: buildInrSearchSectorUrl(sector.slug),
        lastModified: latestCompanyDate(related),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      };
    }),
    ...companies.map((company) => ({
      url: buildInrSearchPublicUrl(company.slug),
      lastModified: validDate(company.updatedAt) || undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
