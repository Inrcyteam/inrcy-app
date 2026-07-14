import type { MetadataRoute } from "next";
import {
  buildInrSearchPublicUrl,
  listPublishedInrSearchCompanies,
} from "@/lib/inrSearchPublic";

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const companies = await listPublishedInrSearchCompanies();

  if (!companies.length) return [];

  return [
    ...companies.map((company) => ({
      url: buildInrSearchPublicUrl(company.slug),
      lastModified: validDate(company.updatedAt) || undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
