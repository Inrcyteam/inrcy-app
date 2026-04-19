import { NextResponse } from "next/server";
import { normalizeMailWebhookPayload, processMailWebhookEvent, verifyMailWebhookRequest } from "@/lib/mailProviderWebhook";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    verifyMailWebhookRequest(rawBody, req.headers);

    const providerHint = new URL(req.url).searchParams.get("provider");
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const events = normalizeMailWebhookPayload(payload, providerHint);

    const summary = {
      received: events.length,
      processed: 0,
      duplicates: 0,
      ignored: 0,
      unmatched: 0,
      delivered: 0,
      bounced: 0,
      complaints: 0,
      unsubscribed: 0,
    };

    for (const event of events) {
      const result = await processMailWebhookEvent(event);
      if (result.duplicate) {
        summary.duplicates += 1;
        continue;
      }
      if (event.kind === "ignored") {
        summary.ignored += 1;
        continue;
      }
      if (!result.matched) {
        summary.unmatched += 1;
        continue;
      }
      summary.processed += 1;
      if (event.kind === "delivered") summary.delivered += 1;
      else if (event.kind === "bounce") summary.bounced += 1;
      else if (event.kind === "complaint") summary.complaints += 1;
      else if (event.kind === "unsubscribe") summary.unsubscribed += 1;
    }

    return NextResponse.json({ success: true, ...summary });
  } catch (error: any) {
    const message = error?.message || "Webhook mail invalide.";
    const status = /signature webhook invalide/i.test(message) ? 401 : /manquant/i.test(message) ? 500 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
