import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";
import { captureApiException } from "@/lib/observability/sentry";
import { withApi } from "@/lib/observability/withApi";

type FideliserEventType = "newsletter_mail" | "thanks_mail" | "satisfaction_mail";

async function fideliserEventsHandler(req: Request) {
  try {
    const { supabase, activeUserId, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    const userId = activeUserId;
const body = await req.json().catch(() => ({}));
    const type = body?.type as FideliserEventType;
    const payload = (body?.payload ?? {}) as Record<string, unknown>;

    if (!type || !["newsletter_mail", "thanks_mail", "satisfaction_mail"].includes(type)) {
      return NextResponse.json({ error: "Type d'action invalide." }, { status: 400 });
    }

    const { error } = await supabase.from("app_events").insert({
      user_id: userId,
      module: "fideliser",
      type,
      payload,
    });

    if (error) {
      captureApiException(req, error, {
        area: "crm_campaigns",
        operation: "POST /api/fideliser/events",
        statusCode: 500,
      });
      return jsonUserFacingError(error, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
}

export const POST = withApi(fideliserEventsHandler, { route: "/api/fideliser/events" });
