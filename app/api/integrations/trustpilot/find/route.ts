import { NextResponse } from "next/server";

import { bubbleAccessDisabledResponse, isAppBubbleEnabledForUser } from "@/lib/appBubbleAccessServer";
import { requireUser } from "@/lib/requireUser";
import { findTrustpilotBusinessUnitByDomain, searchTrustpilotBusinessUnits } from "@/lib/trustpilotOAuth";

export async function GET(request: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  if (!(await isAppBubbleEnabledForUser(supabase, user.id, "trustpilot"))) {
    return bubbleAccessDisabledResponse("Trustpilot");
  }

  try {
    const { searchParams } = new URL(request.url);
    const domain = String(searchParams.get("domain") || "").trim();
    const query = String(searchParams.get("q") || "").trim();

    if (domain) {
      const businessUnit = await findTrustpilotBusinessUnitByDomain(domain);
      return NextResponse.json({ ok: true, businessUnit });
    }

    if (query) {
      const businessUnits = await searchTrustpilotBusinessUnits(query);
      return NextResponse.json({ ok: true, businessUnits });
    }

    return NextResponse.json({ ok: false, error: "Domaine ou recherche Trustpilot manquant." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recherche Trustpilot impossible.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
