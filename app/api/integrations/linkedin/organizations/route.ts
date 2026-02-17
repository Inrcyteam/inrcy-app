import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

async function fetchJson(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
  return data;
}

export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: row } = await supabase
    .from("stats_integrations")
    .select("access_token_enc")
    .eq("user_id", user.id)
    .eq("provider", "linkedin")
    .eq("source", "linkedin")
    .eq("product", "linkedin")
    .maybeSingle();

  const tok = String((row as any)?.access_token_enc || "");
  if (!tok) return NextResponse.json({ error: "LinkedIn not connected" }, { status: 400 });

  // Try to list organizations where the user is admin (best-effort; may require app review/scopes)
  try {
    const acl = await fetchJson(
      "https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
      tok
    );

    const elements = Array.isArray(acl?.elements) ? acl.elements : [];
    const orgUrns = elements
      .map((e: any) => String(e?.organizationalTarget || ""))
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
