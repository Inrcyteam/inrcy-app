import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tryDecryptToken } from "@/lib/oauthCrypto";
import { getGmbToken, gmbCreateLocalPost, gmbDeleteLocalPost, gmbUpdateLocalPost } from "@/lib/googleBusiness";
import { facebookUpdatePost } from "@/lib/facebookPublish";
import { instagramDeleteMedia, instagramPublishPhoto } from "@/lib/instagramPublish";
import { linkedinDeletePost, linkedinPublishImage, linkedinPublishText } from "@/lib/linkedinPublish";

type ChannelKey = "inrcy_site" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";
type JsonRecord = Record<string, any>;
const asRecord = (v: unknown): JsonRecord => (v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : {});

function firstNonEmpty(...vals: any[]) {
  for (const v of vals) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) return s;
  }
  return "";
}
function normalizeHashtag(input: string): string {
  return String(input || "").trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 40);
}
function buildCanonMessage(title: string, content: string, cta: string) {
  return [title, content, cta].filter(Boolean).join("\n\n").trim();
}
function buildInstagramCaption(title: string, content: string, cta: string, hashtags: string[] = []) {
  const base = buildCanonMessage(title, content, cta);
  const cleanTags = hashtags.map(normalizeHashtag).filter(Boolean).slice(0, 8).map((t) => `#${t}`);
  return cleanTags.length ? `${base}\n\n${cleanTags.join(" ")}`.trim().slice(0, 2200) : base.slice(0, 2200);
}
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

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    const userId = user.id;

    const body = await req.json().catch(() => null);
    const eventId = String(body?.eventId || "").trim();
    const channel = String(body?.channel || "").trim() as ChannelKey;
    const rawPost = asRecord(body?.post);
    if (!eventId || !channel) return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });

    const title = String(rawPost.title || "").trim();
    const content = String(rawPost.content || "").trim();
    const cta = String(rawPost.cta || "").trim();
    const hashtags = Array.isArray(rawPost.hashtags) ? rawPost.hashtags.map((x) => normalizeHashtag(String(x || ""))).filter(Boolean).slice(0, 20) : [];
    if (!content) return NextResponse.json({ error: "Le contenu est vide." }, { status: 400 });

    const { data: eventRow, error: eventErr } = await supabaseAdmin
      .from("app_events")
      .select("id,user_id,module,type,payload")
      .eq("id", eventId)
      .eq("user_id", userId)
      .maybeSingle();
    if (eventErr) return NextResponse.json({ error: eventErr.message }, { status: 500 });
    if (!eventRow) return NextResponse.json({ error: "Publication introuvable." }, { status: 404 });

    const payload = asRecord(eventRow.payload);
    const results = asRecord(payload.results);
    const current = asRecord(results[channel]);
    const externalId = String(current.external_id || "").trim();
    const publicationId = String(payload.publication_id || "").trim();

    const postByChannel = asRecord(payload.postByChannel);
    postByChannel[channel] = { ...(asRecord(postByChannel[channel])), title, content, cta, hashtags };
    if (channel === "inrcy_site" && !postByChannel.site_web) postByChannel.site_web = postByChannel[channel];
    if (channel === "site_web" && !postByChannel.inrcy_site) postByChannel.inrcy_site = postByChannel[channel];

    let nextExternalId = externalId;
    const uploadedUrls = Array.isArray(payload.images) ? payload.images.map((x: any) => String(x || "")).filter(Boolean).slice(0, 5) : [];
    const socialFeedUrls = Array.isArray(payload.socialFeedPublishableUrls) ? payload.socialFeedPublishableUrls.map((x: any) => String(x || "")).filter(Boolean).slice(0, 5) : uploadedUrls;
    const instagramUrls = Array.isArray(payload.instagramPublishableUrls) ? payload.instagramPublishableUrls.map((x: any) => String(x || "")).filter(Boolean).slice(0, 5) : socialFeedUrls;
    const canonMessage = buildCanonMessage(title, content, cta);

    if (channel === "inrcy_site" || channel === "site_web") {
      if (!externalId) return NextResponse.json({ error: "Publication site introuvable." }, { status: 400 });
      const { error } = await supabaseAdmin.from("site_articles").update({ title, content, cta, hashtags, images: uploadedUrls }).eq("id", externalId).eq("user_id", userId).eq("source", channel);
      if (error) throw error;
    } else if (channel === "facebook") {
      const fb = asRecord(await getLatestIntegrationRow(userId, "facebook", "facebook", "facebook", "access_token_enc"));
      const token = tryDecryptToken(String(fb.access_token_enc || "")) || "";
      const update = await facebookUpdatePost({ pageAccessToken: token, postId: externalId, message: canonMessage });
      if (!update.ok) return NextResponse.json({ error: update.error }, { status: 400 });
    } else if (channel === "instagram") {
      const ig = asRecord(await getLatestIntegrationRow(userId, "instagram", "instagram", "instagram", "resource_id,access_token_enc"));
      const accessToken = tryDecryptToken(String(ig.access_token_enc || "")) || "";
      const igUserId = String(ig.resource_id || "");
      const imageUrl = instagramUrls[0];
      if (!igUserId || !accessToken || !imageUrl) return NextResponse.json({ error: "Instagram non configuré ou image manquante." }, { status: 400 });
      if (externalId) await instagramDeleteMedia({ accessToken, mediaId: externalId });
      const resp = await instagramPublishPhoto({ igUserId, accessToken, caption: buildInstagramCaption(title, content, cta, hashtags), imageUrl });
      if (!resp.ok) return NextResponse.json({ error: resp.error }, { status: 400 });
      nextExternalId = resp.mediaId;
    } else if (channel === "linkedin") {
      const li = asRecord(await getLatestIntegrationRow(userId, "linkedin", "linkedin", "linkedin", "resource_id,access_token_enc,meta"));
      const accessToken = tryDecryptToken(String(li.access_token_enc || "")) || "";
      const liMeta = asRecord(li.meta);
      const authorUrn = String(liMeta.org_urn || li.resource_id || "");
      const imageUrl = socialFeedUrls[0] || uploadedUrls[0] || "";
      if (!authorUrn || !accessToken) return NextResponse.json({ error: "LinkedIn non configuré." }, { status: 400 });
      if (externalId) await linkedinDeletePost({ accessToken, postUrn: externalId });
      const resp = imageUrl ? await linkedinPublishImage({ accessToken, authorUrn, text: canonMessage, imageUrl, title }) : await linkedinPublishText({ accessToken, authorUrn, text: canonMessage });
      if (!resp.ok) return NextResponse.json({ error: resp.error }, { status: 400 });
      nextExternalId = String(resp.postUrn || "");
    } else if (channel === "gmb") {
      const gmb = asRecord(await getLatestIntegrationRow(userId, "google", "gmb", "gmb", "resource_id,meta"));
      const gmbMeta = asRecord(gmb.meta);
      const locationName = String(gmb.resource_id || "");
      const accountName = String(gmbMeta.account || "");
      const tok = await getGmbToken();
      if (!tok?.accessToken || !locationName || !accountName) return NextResponse.json({ error: "Google Business non configuré." }, { status: 400 });
      if (externalId) {
        try {
          await gmbUpdateLocalPost({ accessToken: tok.accessToken, localPostName: externalId, summary: canonMessage.slice(0, 1498), languageCode: "fr-FR" });
        } catch {
          await gmbDeleteLocalPost({ accessToken: tok.accessToken, localPostName: externalId });
          const republished = await gmbCreateLocalPost({ accessToken: tok.accessToken, accountName, locationName, summary: canonMessage.slice(0, 1498), imageUrls: uploadedUrls, languageCode: "fr-FR" });
          nextExternalId = String(asRecord(republished).name || externalId);
        }
      } else {
        const created = await gmbCreateLocalPost({ accessToken: tok.accessToken, accountName, locationName, summary: canonMessage.slice(0, 1498), imageUrls: uploadedUrls, languageCode: "fr-FR" });
        nextExternalId = String(asRecord(created).name || "");
      }
    } else {
      return NextResponse.json({ error: "Canal non supporté." }, { status: 400 });
    }

    const nextResults = { ...results, [channel]: { ...current, ok: true, deleted: false, external_id: nextExternalId || externalId, updated_at: new Date().toISOString(), error: null } };
    const firstChannel = Array.isArray(payload.channels) && payload.channels.length ? String(payload.channels[0]) : channel;
    const nextPayload = { ...payload, postByChannel, post: asRecord(postByChannel[firstChannel]) || payload.post, results: nextResults };

    const { error: updErr } = await supabaseAdmin.from("app_events").update({ payload: nextPayload }).eq("id", eventId).eq("user_id", userId);
    if (updErr) throw updErr;

    if (publicationId) {
      await supabaseAdmin.from("publication_deliveries").update({ status: "delivered", error: null }).eq("publication_id", publicationId).eq("user_id", userId).eq("channel", channel);
      await supabaseAdmin.from("publications").update({ title: firstNonEmpty(title, payload?.post?.title), content: firstNonEmpty(content, payload?.post?.content), cta: cta || null, hashtags }).eq("id", publicationId).eq("user_id", userId);
    }

    return NextResponse.json({ ok: true, channel, payload: nextPayload });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Impossible de modifier cette publication pour le moment." }, { status: 500 });
  }
}
