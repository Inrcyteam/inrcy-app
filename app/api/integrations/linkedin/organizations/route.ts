import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { asRecord, asString } from "@/lib/tsSafe";
import { getLinkedInAccessToken } from "@/lib/linkedinOAuth";

async function fetchJson(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "Linkedin-Version": process.env.LINKEDIN_API_VERSION || "202604",
      "X-RestLi-Method": "FINDER",
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => ({}));
  const rec = asRecord(data);
  if (!res.ok) throw new Error(asString(rec["message"]) || asString(rec["error"]) || `HTTP ${res.status}`);
  return rec;
}

function normalizeCompanyUrl(id: string, vanityName?: string | null) {
  const vanity = String(vanityName || "").trim().replace(/^\/+|\/+$/g, "");
  if (vanity) return `https://www.linkedin.com/company/${vanity}`;
  return `https://www.linkedin.com/company/${id}`;
}

async function fetchOrganizationNameAndUrl(id: string, accessToken: string) {
  try {
    const org = await fetchJson(`https://api.linkedin.com/v2/organizations/${id}`, accessToken);
    const name = asString(org["localizedName"]) || asString(org["name"]) || id;
    const vanityName = asString(org["vanityName"]);
    return { id, name, url: normalizeCompanyUrl(id, vanityName) };
  } catch {
    return { id, name: id, url: normalizeCompanyUrl(id) };
  }
}

export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });

  const auth = await getLinkedInAccessToken({ userId: user.id });
  const tok = auth.accessToken || "";
  if (!tok) return NextResponse.json({ error: auth.error || "Compte LinkedIn non connecté." }, { status: 400 });

  try {
    const acl = await fetchJson(
      "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100",
      tok
    );

    const aclRec = asRecord(acl);
    const elements = Array.isArray(aclRec["elements"]) ? (aclRec["elements"] as unknown[]) : [];
    const orgUrns = Array.from(new Set(elements
      .map((e: unknown) => {
        const r = asRecord(e);
        return String(r["organization"] || r["organizationalTarget"] || "");
      })
      .filter((u: string) => u.startsWith("urn:li:organization:"))));

    const orgIds = orgUrns.map((u: string) => u.split(":").pop() as string).filter(Boolean);
    const orgs = await Promise.all(orgIds.slice(0, 50).map((id: string) => fetchOrganizationNameAndUrl(id, tok)));

    return NextResponse.json({ organizations: orgs });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossible de récupérer les pages LinkedIn.", organizations: [] }, { status: 500 });
  }
}
