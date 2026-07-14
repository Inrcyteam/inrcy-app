import { NextResponse } from "next/server";

import { getInrSearchPublicStatus } from "@/lib/inrSearchPublic";
import { ensureSystemManagedInrSearch } from "@/lib/inrSearchProvisioning";
import { requireUser } from "@/lib/requireUser";
import { clearAllToolCaches } from "@/lib/statsCache";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";

async function syncSystemManagedPage() {
  const { supabase, errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;

  try {
    const provisioned = await ensureSystemManagedInrSearch(supabase, activeUserId);
    if (provisioned.changed) await clearAllToolCaches(supabase, activeUserId);
    const publicStatus = await getInrSearchPublicStatus(provisioned.inrSearch.slug);
    return NextResponse.json(
      {
        ok: true,
        inrSearch: provisioned.inrSearch,
        publication: {
          allowed: publicStatus.published,
          reason: publicStatus.reason,
        },
        publicStatus,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const message = getSimpleFrenchErrorMessage(error, "Page iNr'Search indisponible.");
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function GET() {
  return syncSystemManagedPage();
}

export async function POST() {
  return syncSystemManagedPage();
}
