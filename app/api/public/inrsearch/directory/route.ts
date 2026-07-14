import { NextRequest, NextResponse } from "next/server";

import {
  buildInrSearchPublicUrl,
  listPublishedInrSearchCompanies,
  normalizeInrSearchDirectorySlug,
  type PublishedInrSearchCompany,
} from "@/lib/inrSearchPublic";

export const revalidate = 300;

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 48;

function normalizeText(value: string | null) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function clampInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function matchesDirectoryFilters(
  company: PublishedInrSearchCompany,
  filters: {
    query: string;
    profession: string;
    sector: string;
    city: string;
    department: string;
    region: string;
  },
) {
  const searchText = normalizeText([
    company.companyName,
    company.pageTitle,
    company.pageDescription,
    company.profession,
    company.sectorLabel,
    company.city,
    company.department,
    company.region,
  ].filter(Boolean).join(" "));

  return (
    (!filters.query || searchText.includes(filters.query))
    && (!filters.profession || company.professionSlug === filters.profession)
    && (!filters.sector || company.sectorSlug === filters.sector)
    && (!filters.city || company.citySlug === filters.city)
    && (!filters.department || company.departmentSlug === filters.department)
    && (!filters.region || company.regionSlug === filters.region)
  );
}

function countFacet(
  companies: PublishedInrSearchCompany[],
  pick: (company: PublishedInrSearchCompany) => { slug: string; label: string },
) {
  const values = new Map<string, { slug: string; label: string; count: number }>();
  for (const company of companies) {
    const value = pick(company);
    if (!value.slug || !value.label) continue;
    const current = values.get(value.slug);
    values.set(value.slug, { ...value, count: (current?.count || 0) + 1 });
  }
  return Array.from(values.values())
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "fr"))
    .slice(0, 100);
}

function toPublicDirectoryItem(company: PublishedInrSearchCompany) {
  return {
    slug: company.slug,
    url: buildInrSearchPublicUrl(company.slug),
    companyName: company.companyName,
    pageTitle: company.pageTitle,
    pageDescription: company.pageDescription,
    city: company.city,
    citySlug: company.citySlug,
    department: company.department,
    departmentSlug: company.departmentSlug,
    region: company.region,
    regionSlug: company.regionSlug,
    profession: company.profession,
    professionSlug: company.professionSlug,
    sectorCategory: company.sectorCategory,
    sectorLabel: company.sectorLabel,
    sectorSlug: company.sectorSlug,
    updatedAt: company.updatedAt,
  };
}

function responseHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    Vary: "Origin",
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: responseHeaders(),
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: responseHeaders() });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const filters = {
    query: normalizeText(params.get("q")),
    profession: normalizeInrSearchDirectorySlug(params.get("metier") || params.get("profession")),
    sector: normalizeInrSearchDirectorySlug(params.get("secteur") || params.get("sector")),
    city: normalizeInrSearchDirectorySlug(params.get("ville") || params.get("city")),
    department: normalizeInrSearchDirectorySlug(params.get("departement") || params.get("department")),
    region: normalizeInrSearchDirectorySlug(params.get("region")),
  };
  const page = clampInteger(params.get("page"), 1, 1, 10_000);
  const pageSize = clampInteger(params.get("pageSize"), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

  try {
    const allCompanies = await listPublishedInrSearchCompanies();
    const companies = allCompanies.filter((company) => matchesDirectoryFilters(company, filters));
    const total = companies.length;
    const start = (page - 1) * pageSize;
    const items = companies.slice(start, start + pageSize).map(toPublicDirectoryItem);
    const latestUpdatedAtValues = allCompanies
      .map((company) => company.updatedAt)
      .filter(Boolean)
      .sort();
    const latestUpdatedAt = latestUpdatedAtValues[latestUpdatedAtValues.length - 1] || null;

    return jsonResponse({
      ok: true,
      items,
      total,
      page,
      pageSize,
      hasNext: start + items.length < total,
      updatedAt: latestUpdatedAt,
      filters: {
        q: params.get("q") || "",
        metier: params.get("metier") || params.get("profession") || "",
        secteur: params.get("secteur") || params.get("sector") || "",
        ville: params.get("ville") || params.get("city") || "",
        departement: params.get("departement") || params.get("department") || "",
        region: params.get("region") || "",
      },
      facets: {
        professions: countFacet(allCompanies, (company) => ({ slug: company.professionSlug, label: company.profession })),
        sectors: countFacet(allCompanies, (company) => ({ slug: company.sectorSlug, label: company.sectorLabel })),
        cities: countFacet(allCompanies, (company) => ({ slug: company.citySlug, label: company.city })),
        departments: countFacet(allCompanies, (company) => ({ slug: company.departmentSlug, label: company.department })),
        regions: countFacet(allCompanies, (company) => ({ slug: company.regionSlug, label: company.region })),
      },
    });
  } catch {
    return jsonResponse({ ok: false, error: "Annuaire iNrCy momentanément indisponible." }, 503);
  }
}
