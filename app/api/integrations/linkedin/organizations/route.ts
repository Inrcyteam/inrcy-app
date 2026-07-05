import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { asRecord, asString } from "@/lib/tsSafe";
import { getLinkedInAccessToken } from "@/lib/linkedinOAuth";
import { resolveActiveInrcyAccountId } from "@/lib/multicompte/server";

type LinkedinOrg = {
  id: string;
  name: string;
  url: string;
};

function linkedinVersion() {
  return process.env.LINKEDIN_API_VERSION || "202604";
}

function normalizeCompanyUrl(id: string, vanityName?: string | null) {
  const vanity = String(vanityName || "").trim().replace(/^\/+|\/+$/g, "");
  if (vanity) return `https://www.linkedin.com/company/${vanity}`;
  return `https://www.linkedin.com/company/${id}`;
}

function normalizeOrgIdFromUrn(value: unknown) {
  const raw = asString(value) || "";
  if (raw.startsWith("urn:li:organization:")) return raw.split(":").pop() || "";
  return raw.trim();
}

function localizedValue(input: unknown): string | null {
  const direct = asString(input);
  if (direct) return direct;

  const rec = asRecord(input);
  const preferredLocale = asRecord(rec["preferredLocale"]);
  const localized = asRecord(rec["localized"]);
  const language = asString(preferredLocale["language"]);
  const country = asString(preferredLocale["country"]);
  const localeKey = [language, country].filter(Boolean).join("_");
  if (localeKey) {
    const preferred = asString(localized[localeKey]);
    if (preferred) return preferred;
  }

  for (const value of Object.values(localized)) {
    const candidate = asString(value);
    if (candidate) return candidate;
  }

  for (const value of Object.values(rec)) {
    const candidate = asString(value);
    if (candidate) return candidate;
  }

  return null;
}

function extractOrgName(org: unknown): string | null {
  const rec = asRecord(org);
  return (
    asString(rec["localizedName"]) ||
    localizedValue(rec["name"]) ||
    localizedValue(rec["localizedName"]) ||
    asString(rec["vanityName"]) ||
    null
  );
}

function extractOrgVanity(org: unknown): string | null {
  const rec = asRecord(org);
  return asString(rec["vanityName"]) || asString(rec["localizedVanityName"]) || null;
}

async function fetchJson(url: string, accessToken: string, extraHeaders?: Record<string, string>) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": linkedinVersion(),
      "Content-Type": "application/json",
      ...(extraHeaders || {}),
    },
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => ({}));
  const rec = asRecord(data);
  if (!res.ok) throw new Error(asString(rec["message"]) || asString(rec["error_description"]) || asString(rec["error"]) || `HTTP ${res.status}`);
  return rec;
}

async function fetchOrganizationNameAndUrl(id: string, accessToken: string): Promise<LinkedinOrg> {
  const fallback: LinkedinOrg = { id, name: id, url: normalizeCompanyUrl(id) };

  const attempts = [
    `https://api.linkedin.com/rest/organizations/${encodeURIComponent(id)}`,
    `https://api.linkedin.com/v2/organizations/${encodeURIComponent(id)}`,
  ];

  for (const url of attempts) {
    try {
      const org = await fetchJson(url, accessToken);
      const name = extractOrgName(org) || id;
      const vanityName = extractOrgVanity(org);
      return { id, name, url: normalizeCompanyUrl(id, vanityName) };
    } catch {
      // LinkedIn peut refuser un endpoint selon la version du produit.
      // On tente l'endpoint suivant avant de revenir au fallback ID.
    }
  }

  return fallback;
}

export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });
  const activeUserId = await resolveActiveInrcyAccountId(supabase, user.id);

  const auth = await getLinkedInAccessToken({ userId: activeUserId });
  const tok = auth.accessToken || "";
  if (!tok) return NextResponse.json({ error: auth.error || "Compte LinkedIn non connecté." }, { status: 400 });

  try {
    const acl = await fetchJson(
      "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100",
      tok,
      { "X-RestLi-Method": "FINDER" },
    );

    const aclRec = asRecord(acl);
    const elements = Array.isArray(aclRec["elements"]) ? (aclRec["elements"] as unknown[]) : [];
    const orgIds = Array.from(new Set(elements
      .map((e: unknown) => {
        const r = asRecord(e);
        return normalizeOrgIdFromUrn(r["organization"] || r["organizationalTarget"]);
      })
      .filter(Boolean)));

    const orgs = await Promise.all(orgIds.slice(0, 50).map((id: string) => fetchOrganizationNameAndUrl(id, tok)));

    return NextResponse.json({ organizations: orgs });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossible de récupérer les pages LinkedIn.", organizations: [] }, { status: 500 });
  }
}
