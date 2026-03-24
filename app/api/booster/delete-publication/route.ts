import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tryDecryptToken } from "@/lib/oauthCrypto";
import { getGmbToken, gmbDeleteLocalPost } from "@/lib/googleBusiness";
import { facebookDeletePost } from "@/lib/facebookPublish";
import { instagramDeleteMediaWithFallbacks } from "@/lib/instagramPublish";
import { linkedinDeletePost } from "@/lib/linkedinPublish";

type ChannelKey = "inrcy_site" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";
type JsonRecord = Record<string, any>;
const asRecord = (v: unknown): JsonRecord => (v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : {});

async function getLatestIntegrationRow(userId: string, provider: string, source: string, product: string, columns: string) {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select(columns)
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("source", source)
    .eq("product", product)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) ? data[0] ?? null : null;
}

async function getInstagramDeleteTokens(userId: string) {
  const tokens: string[] = [];
  const ig = asRecord(await getLatestIntegrationRow(userId, "instagram", "instagram", "instagram", "access_token_enc"));
  const igToken = tryDecryptToken(String(ig.access_token_enc || "")) || "";
  if (igToken) tokens.push(igToken);

  const fb = asRecord(await getLatestIntegrationRow(userId, "facebook", "facebook", "facebook", "access_token_enc,meta"));
  const fbMeta = asRecord(fb.meta);
  const fbUserToken = tryDecryptToken(String(fbMeta.user_access_token_enc || "")) || "";
  const fbAccessToken = tryDecryptToken(String(fb.access_token_enc || "")) || "";
  if (fbUserToken) tokens.push(fbUserToken);
  if (fbAccessToken) tokens.push(fbAccessToken);

  return Array.from(new Set(tokens.filter(Boolean)));
}

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    const userId = user.id;

    const body = await req.json().catch(() => null);
    const eventId = String(body?.eventId || "").trim();
    const channel = String(body?.channel || "").trim() as ChannelKey;
    if (!eventId || !channel) {
      return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });
    }

    const { data: eventRow, error: eventErr } = await supabaseAdmin
      .from("app_events")
      .select("id,user_id,module,type,payload")
      .eq("id", eventId)
      .eq("user_id", userId)
      .maybeSingle();

    if (eventErr) return NextResponse.json({ error: eventErr.message }, { status: 500 });
    if (!eventRow) return NextResponse.json({ error: "Publication introuvable." }, { status: 404 });
    if (String(eventRow.module) !== "booster" || String(eventRow.type) !== "publish") {
      return NextResponse.json({ error: "Suppression disponible uniquement pour les publications Booster." }, { status: 400 });
    }

    const payload = asRecord(eventRow.payload);
    const publicationId = String(payload.publication_id || "").trim();
    const results = asRecord(payload.results);
    const current = asRecord(results[channel]);
    if (current.deleted) {
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }

    const externalId = String(current.external_id || current.externalId || "").trim();
    if (!externalId) {
      return NextResponse.json({ error: `Aucun identifiant de publication enregistré pour ${channel}.` }, { status: 400 });
    }

    if (channel === "inrcy_site" || channel === "site_web") {
      const { error } = await supabaseAdmin
        .from("site_articles")
        .delete()
        .eq("id", externalId)
        .eq("user_id", userId)
        .eq("source", channel);
      if (error) throw error;
    } else if (channel === "facebook") {
      const fb = asRecord(await getLatestIntegrationRow(userId, "facebook", "facebook", "facebook", "status,access_token_enc"));
      const token = tryDecryptToken(String(fb.access_token_enc || "")) || "";
      const resp = await facebookDeletePost({ pageAccessToken: token, postId: externalId });
      if (!resp.ok) return NextResponse.json({ error: resp.error }, { status: 400 });
    } else if (channel === "instagram") {
      const tokens = await getInstagramDeleteTokens(userId);
      const resp = await instagramDeleteMediaWithFallbacks({ mediaId: externalId, accessTokens: tokens });
      if (!resp.ok) return NextResponse.json({ error: resp.error, diagnostics: resp.attempts }, { status: 400 });
    } else if (channel === "linkedin") {
      const li = asRecord(await getLatestIntegrationRow(userId, "linkedin", "linkedin", "linkedin", "status,access_token_enc"));
      const token = tryDecryptToken(String(li.access_token_enc || "")) || "";
      const resp = await linkedinDeletePost({ accessToken: token, postUrn: externalId });
      if (!resp.ok) return NextResponse.json({ error: resp.error }, { status: 400 });
    } else if (channel === "gmb") {
      const tok = await getGmbToken();
      if (!tok?.accessToken) return NextResponse.json({ error: "Token Google invalide/expiré" }, { status: 400 });
      await gmbDeleteLocalPost({ accessToken: tok.accessToken, localPostName: externalId });
    } else {
      return NextResponse.json({ error: "Canal non supporté." }, { status: 400 });
    }

    const nextPayload = { ...payload, results: { ...results, [channel]: { ...current, deleted: true, deleted_at: new Date().toISOString() } } };
    const { error: updErr } = await supabaseAdmin.from("app_events").update({ payload: nextPayload }).eq("id", eventId).eq("user_id", userId);
    if (updErr) throw updErr;

    if (publicationId) {
      const { error: delivErr } = await supabaseAdmin
        .from("publication_deliveries")
        .update({ status: "deleted", error: null })
        .eq("publication_id", publicationId)
        .eq("user_id", userId)
        .eq("channel", channel);
      if (delivErr) console.error("[delete-publication] publication_deliveries update failed", delivErr.message);
    }

    return NextResponse.json({ ok: true, channel, payload: nextPayload });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Impossible de supprimer cette publication pour le moment." }, { status: 500 });
  }
}
