import { asRecord, asString } from "@/lib/tsSafe";

export type FacebookPageAsset = {
  id: string;
  name: string | null;
  access_token: string | null;
  business_id?: string | null;
  business_name?: string | null;
  source: "me_accounts" | "assigned_pages" | "business_owned_pages" | "business_client_pages" | "page_lookup";
  instagram_business_account?: {
    id: string;
    username: string | null;
  } | null;
};

type GraphListResponse<T> = {
  data?: T[];
  paging?: {
    next?: string;
  };
};

async function fetchGraphJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as unknown;
  if (!res.ok) {
    const rec = asRecord(data);
    const err = asRecord(rec["error"]);
    const msg = asString(err["message"]) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

async function fetchAllGraphPages<T>(initialUrl: string, maxPages = 10): Promise<T[]> {
  const all: T[] = [];
  let nextUrl: string | null = initialUrl;
  let count = 0;
  while (nextUrl && count < maxPages) {
    const resp: GraphListResponse<T> = await fetchGraphJson<GraphListResponse<T>>(nextUrl);
    all.push(...(resp.data || []));
    nextUrl = resp.paging?.next || null;
    count += 1;
  }
  return all;
}

function normalizeInstagramBusinessAccount(value: unknown): FacebookPageAsset["instagram_business_account"] {
  const rec = asRecord(value);
  const id = asString(rec["id"]);
  if (!id) return null;
  return {
    id,
    username: asString(rec["username"]) || null,
  };
}

function normalizePage(raw: unknown, source: FacebookPageAsset["source"], business?: { id?: string | null; name?: string | null }): FacebookPageAsset | null {
  const rec = asRecord(raw);
  const id = asString(rec["id"]);
  if (!id) return null;
  return {
    id,
    name: asString(rec["name"]) || null,
    access_token: asString(rec["access_token"]) || null,
    business_id: business?.id || null,
    business_name: business?.name || null,
    source,
    instagram_business_account: normalizeInstagramBusinessAccount(rec["instagram_business_account"]),
  };
}

async function enrichPageWithLookup(page: FacebookPageAsset, userToken: string): Promise<FacebookPageAsset> {
  if (page.access_token && page.instagram_business_account?.id) return page;
  try {
    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(page.id)}?${new URLSearchParams({
      fields: "id,name,access_token,instagram_business_account{username,id}",
      access_token: userToken,
    }).toString()}`;
    const info = await fetchGraphJson<unknown>(url);
    const normalized = normalizePage(info, "page_lookup", {
      id: page.business_id || null,
      name: page.business_name || null,
    });
    if (!normalized) return page;
    return {
      ...page,
      name: normalized.name || page.name,
      access_token: normalized.access_token || page.access_token,
      instagram_business_account: normalized.instagram_business_account || page.instagram_business_account || null,
    };
  } catch {
    return page;
  }
}

export async function listAccessibleFacebookPages(userToken: string): Promise<FacebookPageAsset[]> {
  const merged = new Map<string, FacebookPageAsset>();

  const mergePages = (pages: FacebookPageAsset[]) => {
    for (const page of pages) {
      const prev = merged.get(page.id);
      if (!prev) {
        merged.set(page.id, page);
        continue;
      }
      merged.set(page.id, {
        ...prev,
        ...page,
        name: page.name || prev.name,
        access_token: page.access_token || prev.access_token,
        business_id: page.business_id || prev.business_id,
        business_name: page.business_name || prev.business_name,
        instagram_business_account: page.instagram_business_account || prev.instagram_business_account || null,
        source: prev.source === "me_accounts" ? prev.source : page.source,
      });
    }
  };

  try {
    const url = `https://graph.facebook.com/v20.0/me/accounts?${new URLSearchParams({
      fields: "id,name,access_token,instagram_business_account{username,id}",
      access_token: userToken,
      limit: "200",
    }).toString()}`;
    const rows = await fetchAllGraphPages<unknown>(url);
    mergePages(rows.map((row) => normalizePage(row, "me_accounts")).filter((row): row is FacebookPageAsset => !!row));
  } catch {}

  try {
    const url = `https://graph.facebook.com/v20.0/me/assigned_pages?${new URLSearchParams({
      fields: "id,name,instagram_business_account{username,id}",
      access_token: userToken,
      limit: "200",
    }).toString()}`;
    const rows = await fetchAllGraphPages<unknown>(url);
    mergePages(rows.map((row) => normalizePage(row, "assigned_pages")).filter((row): row is FacebookPageAsset => !!row));
  } catch {}

  try {
    const businessesUrl = `https://graph.facebook.com/v20.0/me/businesses?${new URLSearchParams({
      fields: "id,name",
      access_token: userToken,
      limit: "200",
    }).toString()}`;
    const businesses = await fetchAllGraphPages<unknown>(businessesUrl);

    for (const businessRaw of businesses) {
      const businessRec = asRecord(businessRaw);
      const businessId = asString(businessRec["id"]);
      if (!businessId) continue;
      const business = { id: businessId, name: asString(businessRec["name"]) || null };

      const edges: Array<{ edge: "owned_pages" | "client_pages"; source: FacebookPageAsset["source"] }> = [
        { edge: "owned_pages", source: "business_owned_pages" },
        { edge: "client_pages", source: "business_client_pages" },
      ];

      for (const { edge, source } of edges) {
        try {
          const edgeUrl = `https://graph.facebook.com/v20.0/${encodeURIComponent(businessId)}/${edge}?${new URLSearchParams({
            fields: "id,name,instagram_business_account{username,id}",
            access_token: userToken,
            limit: "200",
          }).toString()}`;
          const pages = await fetchAllGraphPages<unknown>(edgeUrl);
          mergePages(pages.map((row) => normalizePage(row, source, business)).filter((row): row is FacebookPageAsset => !!row));
        } catch {}
      }
    }
  } catch {}

  const enriched = await Promise.all(Array.from(merged.values()).map((page) => enrichPageWithLookup(page, userToken)));
  return enriched.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "fr", { sensitivity: "base" }));
}

export function findAccessibleFacebookPage(pages: FacebookPageAsset[], pageId: string): FacebookPageAsset | null {
  return pages.find((page) => page.id === pageId) || null;
}


export function extractFacebookUserTokens(metaLike: unknown, fallbackTokenEnc?: string | null): string[] {
  const meta = asRecord(metaLike);
  const rawCandidates = [
    asString(meta["standard_user_access_token_enc"]),
    asString(meta["business_user_access_token_enc"]),
    asString(meta["user_access_token_enc"]),
    asString(meta["user_access_token"]),
    asString(fallbackTokenEnc || null),
  ].filter(Boolean) as string[];

  const unique: string[] = [];
  for (const raw of rawCandidates) {
    if (!raw || unique.includes(raw)) continue;
    unique.push(raw);
  }
  return unique;
}

export async function listAccessibleFacebookPagesFromTokens(userTokens: string[]): Promise<FacebookPageAsset[]> {
  const merged = new Map<string, FacebookPageAsset>();
  for (const token of userTokens) {
    if (!token) continue;
    try {
      const pages = await listAccessibleFacebookPages(token);
      for (const page of pages) {
        const prev = merged.get(page.id);
        if (!prev) {
          merged.set(page.id, page);
          continue;
        }
        merged.set(page.id, {
          ...prev,
          ...page,
          name: page.name || prev.name,
          access_token: page.access_token || prev.access_token,
          business_id: page.business_id || prev.business_id,
          business_name: page.business_name || prev.business_name,
          instagram_business_account: page.instagram_business_account || prev.instagram_business_account || null,
          source: prev.source === "me_accounts" ? prev.source : page.source,
        });
      }
    } catch {}
  }

  return Array.from(merged.values()).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "fr", { sensitivity: "base" }));
}
