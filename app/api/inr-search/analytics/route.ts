import { NextResponse } from "next/server";

import { readInrSearchAnalytics } from "@/lib/inrSearchAnalytics";
import { buildInrSearchPublicUrl, getInrSearchPublicStatus } from "@/lib/inrSearchPublic";
import { ensureSystemManagedInrSearch } from "@/lib/inrSearchProvisioning";
import { loadInrSearchQuality } from "@/lib/inrSearchQuality";
import { requireUser } from "@/lib/requireUser";

export async function GET() {
  const { supabase, errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;

  try {
    const provisioned = await ensureSystemManagedInrSearch(supabase, activeUserId);
    const slug = String(provisioned.inrSearch.slug || "").trim();
    const [analytics, quality, publicStatus] = await Promise.all([
      readInrSearchAnalytics(activeUserId),
      loadInrSearchQuality(activeUserId, provisioned.inrSearch),
      getInrSearchPublicStatus(slug),
    ]);

    return NextResponse.json({
      ok: true,
      analytics,
      page: {
        enabled: publicStatus.published,
        loading: false,
        slug,
        publicUrl: slug ? buildInrSearchPublicUrl(slug) : "",
        pageTitle: String(provisioned.inrSearch.pageTitle || "").trim(),
        qualityScore: quality.score,
        qualityLabel: quality.level,
        publicationReason: publicStatus.reason,
      },
      publicStatus,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Statistiques iNr'Search indisponibles.";
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
