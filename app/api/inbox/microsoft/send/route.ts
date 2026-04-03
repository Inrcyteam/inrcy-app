import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { withApi } from "@/lib/observability/withApi";
import { fetchWithRetry } from "@/lib/observability/fetch";
import { asRecord, asString, asHttpStatus, safeErrorMessage } from "@/lib/tsSafe";
import { encryptToken, tryDecryptToken } from "@/lib/oauthCrypto";
import { downloadMailAttachmentRefs, parseMailAttachmentRefs } from "@/lib/mailAttachmentRefs";
import { applyAutoSignatureToHtml, applyAutoSignatureToText, buildInrSendSignature, textToSimpleHtml } from "@/lib/inrsendSignature";

// Microsoft Graph mail send requires Node.js runtime in most deployments.
export const runtime = "nodejs";
function isExpired(expires_at?: string | null, skewSeconds = 60) {
  if (!expires_at) return false;
  const t = Date.parse(expires_at);
  if (Number.isNaN(t)) return false;
  return t <= Date.now() + skewSeconds * 1000;
}

async function refreshAccessToken(refreshToken: string, scope?: string | null) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, status: 500, data: { error: "Configuration Outlook incomplète côté serveur." } };
  }

  const fallbackScope = [
    "openid",
    "profile",
    "email",
    "offline_access",
    "Mail.Read",
    "Mail.ReadWrite",
    "Mail.Send",
  ].join(" ");

  const res = await fetchWithRetry("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: scope || fallbackScope,
    }),
    retries: 2,
    timeoutMs: 15_000,
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function textToHtml(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
  return `<div style="font-family:system-ui,Segoe UI,Arial">${escaped}</div>`;
}

const handler = async (req: Request) => {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    const userId = user.id;
    const ct = req.headers.get("content-type") || "";
    let accountId = "";
    let sendItemId = "";
    let sendType = "mail";
    let sourceDocSaveId = "";
    let sourceDocType = "";
    let sourceDocNumber = "";
    let to = "";
    let subject = "(sans objet)";
    let text = "";
    let attachmentRefs: ReturnType<typeof parseMailAttachmentRefs> = [];

    if (ct.includes("multipart/form-data")) {
      const formData = await req.formData();
      accountId = String(formData.get("accountId") || "").trim();
      sendItemId = String(formData.get("sendItemId") || "").trim();
      sendType = String(formData.get("type") || "mail").trim() || "mail";
      sourceDocSaveId = String(formData.get("sourceDocSaveId") || "").trim();
      sourceDocType = String(formData.get("sourceDocType") || "").trim();
      sourceDocNumber = String(formData.get("sourceDocNumber") || "").trim();
      to = String(formData.get("to") || "").trim();
      subject = String(formData.get("subject") || "(sans objet)");
      text = String(formData.get("text") || "");
    } else {
      const body = await req.json().catch(() => ({}));
      accountId = String(body.accountId || "").trim();
      sendItemId = String(body.sendItemId || "").trim();
      sendType = String(body.type || "mail").trim() || "mail";
    sourceDocSaveId = String(body.sourceDocSaveId || "").trim();
    sourceDocType = String(body.sourceDocType || "").trim();
    sourceDocNumber = String(body.sourceDocNumber || "").trim();
      to = String(body.to || "").trim();
      subject = String(body.subject || "(sans objet)");
      text = String(body.text || "");
      attachmentRefs = parseMailAttachmentRefs(body.attachments);
    }

    if (!accountId) {
      return NextResponse.json({ error: "Boîte d’envoi manquante." }, { status: 400 });
    }
    if (!to) {
      return NextResponse.json({ error: "Destinataire manquant." }, { status: 400 });
    }

    const { data: account, error: accErr } = await supabase
      .from("integrations")
      .select("id,user_id,provider,account_email,access_token_enc,refresh_token_enc,expires_at,status,settings")
      .eq("id", accountId)
      .eq("user_id", userId)
      .eq("provider", "microsoft")
      .eq("category", "mail")
      .eq("status", "connected")
      .single();

    if (accErr || !account) {
      return NextResponse.json({ error: "La boîte Outlook sélectionnée est introuvable." }, { status: 404 });
    }

    const signatureSettings = await buildInrSendSignature({ supabase: supabase as any, userId, account });
    const finalText = applyAutoSignatureToText(text || "", signatureSettings.signatureText);
    const finalHtml = applyAutoSignatureToHtml(textToSimpleHtml(text || ""), signatureSettings.signatureText, signatureSettings.imageUrl, signatureSettings.imageWidth);

    // Supabase row typing may be '{}' depending on generated types.
    // Parse defensively from unknown to avoid Next.js build-time type errors.
    const accRec = asRecord(account);
    const accountRowId = asString(accRec["id"]) || accountId;
    const expiresAt = asString(accRec["expires_at"]);
    const refreshTokenEnc = asString(accRec["refresh_token_enc"]);
    const accessTokenEnc = asString(accRec["access_token_enc"]);
    const refreshToken: string | null = refreshTokenEnc ? tryDecryptToken(refreshTokenEnc) : null;
    let accessToken: string | null = accessTokenEnc ? tryDecryptToken(accessTokenEnc) : null;

    const settingsRec = asRecord(accRec["settings"]);
    const scopesRaw = asString(settingsRec["scopes_raw"]);

    if (!accessToken) {
      return NextResponse.json({ error: "Jeton d’accès manquant." }, { status: 500 });
    }

    // refresh si expiré
    if (refreshToken && isExpired(expiresAt)) {
      const r = await refreshAccessToken(refreshToken, scopesRaw ?? null);
      if (r.ok && r.data?.access_token) {
        accessToken = String(r.data.access_token);
        const newExpiresAt = r.data?.expires_in
          ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString()
          : null;

        await supabase
          .from("integrations")
          .update({ access_token_enc: encryptToken(accessToken), expires_at: newExpiresAt, status: "connected" })
          .eq("id", accountRowId);
      }
    }

    const graphAttachments = attachmentRefs.length > 0
      ? (await downloadMailAttachmentRefs(supabase, attachmentRefs)).map((item) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: item.filename,
          contentType: item.mimeType || "application/octet-stream",
          contentBytes: item.content.toString("base64"),
        }))
      : [];

    const graphRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: "HTML",
            content: finalHtml,
          },
          toRecipients: [{ emailAddress: { address: to } }],
          ...(graphAttachments.length > 0 ? { attachments: graphAttachments } : {}),
        },
        saveToSentItems: true,
      }),
    });

    if (!graphRes.ok) {
      const details = await graphRes.text().catch(() => "");
      return NextResponse.json({ error: "Envoi Outlook impossible pour le moment.", details }, { status: 500 });
    }

    // --- iNr'Send history (Supabase) ---
    const historyPayload = {
      user_id: userId,
      integration_id: accountId,
      type: (sendType as unknown) || "mail",
      status: "sent",
      to_emails: to,
      subject: subject || null,
      body_text: finalText || null,
      body_html: null,
      provider: "microsoft",
      provider_message_id: null,
      source_doc_save_id: sourceDocSaveId || null,
      source_doc_type: sourceDocType || null,
      source_doc_number: sourceDocNumber || null,
      provider_thread_id: null,
      sent_at: new Date().toISOString(),
      error: null,
    };

    if (sendItemId) {
      await supabase.from("send_items").update(historyPayload).eq("id", sendItemId);
    } else {
      await supabase.from("send_items").insert(historyPayload);
    }

    // Keep only the latest 20 SENT items in history (trash removed).
    try {
      const { data: recent } = await supabase
        .from("send_items")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "sent")
        .order("created_at", { ascending: false })
        .limit(60);

      const ids = (recent || []).map((r: Record<string, unknown>) => r.id).filter(Boolean);
      if (ids.length > 20) {
        const toDelete = ids.slice(20);
        await supabase.from("send_items").delete().in("id", toDelete);
      }
    } catch {
      // Never block sending
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: safeErrorMessage(e) || "Impossible d'envoyer le message pour le moment." },
      { status: asHttpStatus(asRecord(e)["status"], 500) }
    );
  }
};

export const POST = withApi(handler, { route: "/api/inbox/microsoft/send" });

