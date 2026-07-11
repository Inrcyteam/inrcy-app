import {
  buildInrSearchProfessionUrl,
  buildInrSearchPublicUrl,
  buildInrSearchSectorUrl,
  getInrSearchPublicOrigin,
  listPublishedInrSearchCompanies,
} from "@/lib/inrSearchPublic";

export const INR_SEARCH_INDEXNOW_KEY = "8f5f3bd2c4a4412a9a663fbd7e094c61";


export function serializeInrSearchJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function uniqueUrls(values: Array<string | null | undefined>) {
  const origin = getInrSearchPublicOrigin();
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
    .filter((value) => value === origin || value.startsWith(`${origin}/`))
    .slice(0, 10_000);
}

export async function buildInrSearchIndexingUrls(slug?: string | null) {
  const origin = getInrSearchPublicOrigin();
  const normalizedSlug = String(slug || "").trim();
  const companies = normalizedSlug ? await listPublishedInrSearchCompanies() : [];
  const company = companies.find((item) => item.slug === normalizedSlug) || null;

  return uniqueUrls([
    `${origin}/entreprises`,
    `${origin}/metiers`,
    `${origin}/secteurs`,
    `${origin}/sitemap.xml`,
    normalizedSlug ? buildInrSearchPublicUrl(normalizedSlug) : null,
    company?.professionSlug ? buildInrSearchProfessionUrl(company.professionSlug) : null,
    company?.professionSlug && company.citySlug
      ? buildInrSearchProfessionUrl(company.professionSlug, company.citySlug)
      : null,
    company?.sectorSlug ? buildInrSearchSectorUrl(company.sectorSlug) : null,
  ]);
}

export async function submitInrSearchUrlsToIndexNow(urls: string[]) {
  const origin = getInrSearchPublicOrigin();
  const host = new URL(origin).host;
  const urlList = uniqueUrls(urls);
  if (!urlList.length) return { ok: true, submitted: 0, status: 204 };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);

  try {
    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: INR_SEARCH_INDEXNOW_KEY,
        keyLocation: `${origin}/${INR_SEARCH_INDEXNOW_KEY}.txt`,
        urlList,
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    return {
      ok: response.ok || response.status === 202,
      submitted: urlList.length,
      status: response.status,
    };
  } catch {
    return { ok: false, submitted: 0, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}
