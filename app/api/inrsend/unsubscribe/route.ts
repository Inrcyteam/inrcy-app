import { NextResponse } from "next/server";
import { markQueuedRecipientsBlockedBySuppression, upsertSuppressionEntry } from "@/lib/mailSuppression";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function htmlPage(title: string, message: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title><style>body{font-family:Inter,Arial,sans-serif;background:#0b1220;color:#fff;padding:32px} .card{max-width:640px;margin:48px auto;padding:24px;border-radius:20px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)} h1{margin:0 0 12px;font-size:24px} p{margin:0;color:rgba(255,255,255,.82);line-height:1.6}</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`,
    {
      status,
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
}

async function unsubscribeByRecipient(campaignId: string, recipientId: string) {
  const { data, error } = await supabaseAdmin
    .from("mail_campaign_recipients")
    .select("id,campaign_id,user_id,email")
    .eq("id", recipientId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id || !data?.user_id || !data?.email) return false;

  await upsertSuppressionEntry({
    user_id: String(data.user_id),
    email: String(data.email),
    reason: "opt_out",
    source: "public_unsubscribe",
    campaign_id: String(data.campaign_id || campaignId),
    recipient_id: String(data.id),
    note: "Désinscription depuis le lien email.",
  });

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("mail_campaign_recipients")
    .update({
      unsubscribed_at: now,
      suppression_reason: "opt_out",
      updated_at: now,
      error: "Désinscription demandée par le destinataire.",
      last_error: "Désinscription demandée par le destinataire.",
    })
    .eq("id", recipientId)
    .eq("campaign_id", campaignId);

  await markQueuedRecipientsBlockedBySuppression({
    userId: String(data.user_id),
    email: String(data.email),
    reason: "opt_out",
    source: "public_unsubscribe",
    note: "Désinscription depuis le lien email.",
  });

  return true;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const campaignId = String(url.searchParams.get("campaignId") || "").trim();
    const recipientId = String(url.searchParams.get("recipientId") || "").trim();

    if (!campaignId || !recipientId) {
      return htmlPage("Lien invalide", "Le lien de désinscription est incomplet ou expiré.", 400);
    }

    const ok = await unsubscribeByRecipient(campaignId, recipientId);
    if (!ok) {
      return htmlPage("Lien invalide", "Nous n’avons pas retrouvé ce destinataire.", 404);
    }

    return htmlPage("Désinscription confirmée", "Vous ne recevrez plus les campagnes marketing liées à cet expéditeur.");
  } catch (error) {
    console.error(error);
    return htmlPage("Erreur", "La désinscription n’a pas pu être enregistrée pour le moment.", 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const campaignId = String(body?.campaignId || "").trim();
    const recipientId = String(body?.recipientId || "").trim();
    if (!campaignId || !recipientId) {
      return NextResponse.json({ error: "Lien de désinscription incomplet." }, { status: 400 });
    }

    const ok = await unsubscribeByRecipient(campaignId, recipientId);
    if (!ok) {
      return NextResponse.json({ error: "Destinataire introuvable." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Désinscription impossible." }, { status: 500 });
  }
}
