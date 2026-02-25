import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { tryDecryptToken } from "@/lib/oauthCrypto";
import { asRecord, asString } from "@/lib/tsSafe";

async function fetchJson(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => ({}));
  const rec = asRecord(data);
  if (!res.ok) throw new Error(asString(rec["message"]) || asString(rec["error"]) || `HTTP ${res.status}`);
  return rec;
}

export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: rows } = await supabase
    .from("integrations")
    .select("access_token_enc")
    .eq("user_id", user.id)
    .eq("provider", "linkedin")
    .eq("source", "linkedin")
    .eq("product", "linkedin")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  const row = (rows?.[0] as unknown) ?? null;
  const rowRec = asRecord(row);
  const tokRaw = String(rowRec["access_token_enc"] || "");
  const tok = tryDecryptToken(tokRaw) || "";
  if (!tok) return NextResponse.json({ error: "LinkedIn not connected" }, { status: 400 });

  // Try to list organizations where the user is admin (best-effort; may require app review/scopes)
  try {
    const acl = await fetchJson(
      "https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
      tok
    );

    const aclRec = asRecord(acl);
    const elements = Array.isArray(aclRec["elements"]) ? (aclRec["elements"] as unknown[]) : [];
    const orgUrns = elements
      .map((e: unknown) => {
        const r = asRecord(e);
        return String(r["organizationalTarget"] || "");
      })
      .filter((u: string) => u.startsWith("urn:li:organization:"));

    const orgIds = orgUrns.map((u: string) => u.split(":").pop() as string);

    // Fetch names (best-effort)
    const orgs = await Promise.all(
      orgIds.slice(0, 20).map(async (id: string) => {
        try {
          const org = await fetchJson(`https://api.linkedin.com/v2/organizations/${id}`, tok);
          return { id, name: String(org?.localizedName || org?.name || id) };
        } catch {
          return { id, name: id };
        }
      })
    );

    return NextResponse.json({ organizations: orgs });
  } catch {
    return NextResponse.json({ organizations: [] });
  }
}
