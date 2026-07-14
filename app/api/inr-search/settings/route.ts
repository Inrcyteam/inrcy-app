import { NextResponse } from "next/server";

import { getInrSearchPublicStatus } from "@/lib/inrSearchPublic";
import { getInrSearchPublicationEligibility } from "@/lib/inrSearchEligibility";
import { ensureSystemManagedInrSearch } from "@/lib/inrSearchProvisioning";
import { revalidateInrSearchPublicRoutes } from "@/lib/inrSearchProvisioning";
import { requireUser } from "@/lib/requireUser";
import { clearAllToolCaches } from "@/lib/statsCache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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

type InrSearchAction = "connect" | "disconnect" | "directory";

async function applyAction(request: Request) {
  const { supabase, errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action as InrSearchAction : null;
  if (!action) return syncSystemManagedPage();

  if (!["connect", "disconnect", "directory"].includes(action)) {
    return NextResponse.json({ ok: false, error: "Action iNr'Search inconnue." }, { status: 400 });
  }

  try {
    const provisioned = await ensureSystemManagedInrSearch(supabase, activeUserId);
    const current = provisioned.inrSearch as Record<string, unknown>;
    const slug = typeof current.slug === "string" ? current.slug : "";
    if (!slug) throw new Error("La page iNr'Search ne peut pas encore être connectée : le profil est incomplet.");

    if (action === "connect") {
      const eligibility = await getInrSearchPublicationEligibility(activeUserId);
      if (!eligibility.allowed) {
        throw new Error("La page iNr'Search ne peut pas être connectée pour le moment.");
      }
    }

    const now = new Date().toISOString();
    const next = {
      ...current,
      enabled: action === "connect"
        ? true
        : action === "disconnect"
          ? false
          : Boolean(current.enabled),
      directoryEnabled: action === "directory"
        ? Boolean(current.enabled) && Boolean(body.enabled)
        : action === "disconnect"
          ? false
          : Boolean(current.directoryEnabled),
      updatedAt: now,
      publishedAt: action === "connect" ? String(current.publishedAt || now) : current.publishedAt || null,
      indexingRequestedAt: action === "connect" ? now : current.indexingRequestedAt || null,
    };

    const update = await supabaseAdmin
      .from("pro_tools_configs")
      .upsert({ user_id: activeUserId, settings: { ...provisioned.root, inrSearch: next } }, { onConflict: "user_id" });
    if (update.error) throw update.error;

    revalidateInrSearchPublicRoutes(slug);
    await clearAllToolCaches(supabase, activeUserId);
    return syncSystemManagedPage();
  } catch (error) {
    const message = getSimpleFrenchErrorMessage(error, "Mise à jour de la page iNr'Search impossible.");
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function GET() {
  return syncSystemManagedPage();
}

export async function POST(request: Request) {
  return applyAction(request);
}
