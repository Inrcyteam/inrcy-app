import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tryDecryptToken } from "@/lib/oauthCrypto";
import { facebookPublishToPage } from "@/lib/facebookPublish";
import { instagramPublishCarousel, instagramPublishPhoto } from "@/lib/instagramPublish";
import { linkedinPublishImage, linkedinPublishMultiImage, linkedinPublishText } from "@/lib/linkedinPublish";
import { getGmbToken, gmbCreateLocalPost } from "@/lib/googleBusiness";

const FACEBOOK_GRAPH_VERSION = "v20.0";
const LINKEDIN_VERSION = "202603";

type ChannelKey = "inrcy_site" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";
type JsonRecord = Record<string, any>;

type PostPayload = {
  title: string;
  content: string;
  cta: string;
  hashtags: string[];
};

function asRecord(v: unknown): JsonRecord {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : {};
}

function normalizeChannelKey(channel: string): ChannelKey | null {
  const normalized = String(channel || "").trim().toLowerCase();
  switch (normalized) {
    case "inrcy_site":
    case "site_inrcy":
      return "inrcy_site";
    case "site_web":
    case "website":
    case "web":
      return "site_web";
    case "gmb":
    case "google_business":
    case "google business":
      return "gmb";
    case "facebook":
    case "instagram":
    case "linkedin":
      return normalized;
    default:
      return null;
  }
}

function normalizeHashtag(input: string): string {
  return String(input || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .slice(0, 40);
}

function buildCanonMessage(title: string, content: string, cta: string) {
  return [title, content, cta].map((x) => String(x || "").trim()).filter(Boolean).join("\n\n").trim();
}

function buildInstagramCaption(title: string, content: string, cta: string, hashtags: string[] = []) {
  const base = buildCanonMessage(title, content, cta);
  const cleanTags = hashtags
    .map(normalizeHashtag)
    .filter(Boolean)
    .slice(0, 8)
    .map((tag) => `#${tag}`);
  return cleanTags.length ? `${base}\n\n${cleanTags.join(" ")}`.trim().slice(0, 2200) : base.slice(0, 2200);
}

function errMessage(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

function getChannelPost(eventPayload: JsonRecord, publication: JsonRecord, channel: ChannelKey): PostPayload {
  const postByChannel = asRecord(eventPayload.postByChannel);
  const raw = asRecord(postByChannel[channel] ?? (channel === "inrcy_site" ? postByChannel.site_web : channel === "site_web" ? postByChannel.inrcy_site : null) ?? eventPayload.post);
  const publicationTags = Array.isArray(publication.hashtags) ? publication.hashtags : [];
  const rawTags = Array.isArray(raw.hashtags) ? raw.hashtags : Array.isArray(eventPayload?.post?.hashtags) ? eventPayload.post.hashtags : publicationTags;
  return {
    title: String(raw.title ?? publication.title ?? "").trim(),
    content: String(raw.content ?? raw.text ?? raw.message ?? publication.content ?? "").trim(),
    cta: String(raw.cta ?? publication.cta ?? "").trim(),
    hashtags: rawTags.map((tag: unknown) => normalizeHashtag(String(tag || ""))).filter(Boolean).slice(0, 20),
  };
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

async function loadPublicationContext(userId: string, publicationId: string) {
  const { data: publication, error: publicationError } = await supabaseAdmin
    .from("publications")
    .select("id,user_id,title,content,cta,hashtags,images,idea,created_at")
    .eq("id", publicationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (publicationError) throw publicationError;
  if (!publication) return null;

  const { data: events, error: eventsError } = await supabaseAdmin
    .from("app_events")
    .select("id,payload,created_at")
    .eq("user_id", userId)
    .eq("module", "booster")
    .eq("type", "publish")
    .order("created_at", { ascending: false })
    .limit(200);

  if (eventsError) throw eventsError;

  const event = (events || []).find((row: any) => String(asRecord(row.payload).publication_id || "") === publicationId) ?? null;
  const eventPayload = asRecord(event?.payload);

  return {
    publication: asRecord(publication),
    event,
    eventPayload,
  };
}

async function deleteFacebookPost(externalId: string, pageAccessToken: string) {
  if (!externalId) return;
  const qs = new URLSearchParams({ access_token: pageAccessToken });
  const res = await fetch(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${encodeURIComponent(externalId)}?${qs.toString()}`, {
    method: "DELETE",
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error?.message || `Suppression Facebook impossible (${res.status})`);
  }
}

async function deleteInstagramMedia(externalId: string, accessToken: string) {
  if (!externalId) return;
  const qs = new URLSearchParams({ access_token: accessToken });
  const res = await fetch(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${encodeURIComponent(externalId)}?${qs.toString()}`, {
    method: "DELETE",
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error?.message || `Suppression Instagram impossible (${res.status})`);
  }
}

async function deleteLinkedInPost(externalId: string, accessToken: string) {
  if (!externalId) return;
  const res = await fetch(`https://api.linkedin.com/rest/posts/${encodeURIComponent(externalId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "X-RestLi-Method": "DELETE",
      "Linkedin-Version": LINKEDIN_VERSION,
    },
    cache: "no-store",
  });
  if (!res.ok && res.status !== 404) {
    const raw = await res.text().catch(() => "");
    throw new Error(raw || `Suppression LinkedIn impossible (${res.status})`);
  }
}

async function deleteGmbPost(externalId: string, accessToken: string) {
  if (!externalId) return;
  const res = await fetch(`https://mybusiness.googleapis.com/v4/${externalId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const raw = await res.text().catch(() => "");
  if (!res.ok && res.status !== 404) {
    throw new Error(raw || `Suppression Google Business impossible (${res.status})`);
  }
}

async function replaceChannelDelivery(params: {
  userId: string;
  channel: ChannelKey;
  previousExternalId?: string | null;
  publication: JsonRecord;
  eventPayload: JsonRecord;
  nextPost: PostPayload;
}) {
  const { userId, channel, previousExternalId, publication, eventPayload, nextPost } = params;
  const images = Array.isArray(publication.images) ? publication.images.map((x: unknown) => String(x || "").trim()).filter(Boolean) : [];
  const socialFeedImageUrls = Array.isArray(eventPayload.socialFeedPublishableUrls) && eventPayload.socialFeedPublishableUrls.length
    ? eventPayload.socialFeedPublishableUrls.map((x: unknown) => String(x || "").trim()).filter(Boolean)
    : images;
  const instagramImageUrls = Array.isArray(eventPayload.instagramPublishableUrls) && eventPayload.instagramPublishableUrls.length
    ? eventPayload.instagramPublishableUrls.map((x: unknown) => String(x || "").trim()).filter(Boolean)
    : images;

  const canonMessage = buildCanonMessage(nextPost.title, nextPost.content, nextPost.cta);

  if (channel === "inrcy_site" || channel === "site_web") {
    const { data: article, error: articleError } = await supabaseAdmin
      .from("site_articles")
      .update({
        title: nextPost.title,
        content: nextPost.content,
        cta: nextPost.cta,
        hashtags: nextPost.hashtags,
        images,
      })
      .eq("id", previousExternalId || "")
      .eq("user_id", userId)
      .eq("source", channel)
      .select("id")
      .maybeSingle();

    if (articleError) throw articleError;
    if (!article?.id) throw new Error("Article du site introuvable.");
    return { externalId: article.id, status: "delivered", error: null };
  }

  const [fbRow, gmbRow, igRow, liRow] = await Promise.all([
    getLatestIntegrationRow(userId, "facebook", "facebook", "facebook", "status,resource_id,access_token_enc,expires_at"),
    getLatestIntegrationRow(userId, "google", "gmb", "gmb", "status,resource_id,meta,expires_at"),
    getLatestIntegrationRow(userId, "instagram", "instagram", "instagram", "status,resource_id,access_token_enc,resource_label,meta,expires_at"),
    getLatestIntegrationRow(userId, "linkedin", "linkedin", "linkedin", "status,resource_id,access_token_enc,meta,expires_at"),
  ]);

  if (channel === "facebook") {
    const fb = asRecord(fbRow);
    const pageId = String(fb.resource_id ?? "");
    const pageToken = tryDecryptToken(String(fb.access_token_enc ?? "")) || "";
    if (String(fb.status ?? "") !== "connected" || !pageId || !pageToken) throw new Error("Facebook non configuré.");
    if (previousExternalId) await deleteFacebookPost(previousExternalId, pageToken);
    const resp = await facebookPublishToPage({ pageId, pageAccessToken: pageToken, message: canonMessage, imageUrls: socialFeedImageUrls });
    if (!resp.ok) throw new Error(resp.error);
    return { externalId: resp.postId, status: "delivered", error: null };
  }

  if (channel === "instagram") {
    const ig = asRecord(igRow);
    const igUserId = String(ig.resource_id ?? "");
    const igToken = tryDecryptToken(String(ig.access_token_enc ?? "")) || "";
    if (String(ig.status ?? "") !== "connected" || !igUserId || !igToken) throw new Error("Instagram non configuré.");
    const instagramImages = instagramImageUrls.filter(Boolean).slice(0, 10);
    if (!instagramImages.length) throw new Error("Instagram nécessite au moins 1 image.");
    if (previousExternalId) await deleteInstagramMedia(previousExternalId, igToken);
    const resp = instagramImages.length > 1
      ? await instagramPublishCarousel({
          igUserId,
          accessToken: igToken,
          caption: buildInstagramCaption(nextPost.title, nextPost.content, nextPost.cta, nextPost.hashtags),
          imageUrls: instagramImages,
        })
      : await instagramPublishPhoto({
          igUserId,
          accessToken: igToken,
          caption: buildInstagramCaption(nextPost.title, nextPost.content, nextPost.cta, nextPost.hashtags),
          imageUrl: instagramImages[0],
        });
    if (!resp.ok) throw new Error(resp.error);
    return { externalId: resp.mediaId, status: "delivered", error: null };
  }

  if (channel === "linkedin") {
    const li = asRecord(liRow);
    const accessToken = tryDecryptToken(String(li.access_token_enc ?? "")) || "";
    const authorUrn = String(asRecord(li.meta).org_urn ?? li.resource_id ?? "");
    if (String(li.status ?? "") !== "connected" || !accessToken || !authorUrn) throw new Error("LinkedIn non configuré.");
    if (previousExternalId) await deleteLinkedInPost(previousExternalId, accessToken);
    const linkedInImages = socialFeedImageUrls.filter(Boolean).slice(0, 20);
    const resp = linkedInImages.length > 1
      ? await linkedinPublishMultiImage({ accessToken, authorUrn, text: canonMessage, imageUrls: linkedInImages, title: nextPost.title || undefined })
      : linkedInImages[0]
        ? await linkedinPublishImage({ accessToken, authorUrn, text: canonMessage, imageUrl: linkedInImages[0], title: nextPost.title || undefined })
        : await linkedinPublishText({ accessToken, authorUrn, text: canonMessage });
    if (!resp.ok) throw new Error(resp.error);
    return { externalId: resp.postUrn || null, status: "delivered", error: null };
  }

  if (channel === "gmb") {
    const gmb = asRecord(gmbRow);
    const meta = asRecord(gmb.meta);
    const accountName = String(meta.account ?? "");
    const locationName = String(gmb.resource_id ?? "");
    if (String(gmb.status ?? "") !== "connected" || !accountName || !locationName) throw new Error("Google Business non configuré.");
    const token = await getGmbToken();
    if (!token?.accessToken) throw new Error("Token Google Business invalide.");
    if (previousExternalId) await deleteGmbPost(previousExternalId, token.accessToken);
    const resp = await gmbCreateLocalPost({
      accessToken: token.accessToken,
      accountName,
      locationName,
      summary: canonMessage.slice(0, 1498),
      imageUrls: socialFeedImageUrls,
      languageCode: "fr-FR",
    });
    return { externalId: String(asRecord(resp).name ?? "") || null, status: "delivered", error: null };
  }

  throw new Error("Canal non supporté.");
}

async function removeChannelDelivery(params: {
  userId: string;
  channel: ChannelKey;
  previousExternalId?: string | null;
}) {
  const { userId, channel, previousExternalId } = params;

  if (channel === "inrcy_site" || channel === "site_web") {
    if (previousExternalId) {
      const { error } = await supabaseAdmin.from("site_articles").delete().eq("id", previousExternalId).eq("user_id", userId).eq("source", channel);
      if (error) throw error;
    }
    return;
  }

  const [fbRow, gmbRow, igRow, liRow] = await Promise.all([
    getLatestIntegrationRow(userId, "facebook", "facebook", "facebook", "status,resource_id,access_token_enc"),
    getLatestIntegrationRow(userId, "google", "gmb", "gmb", "status,resource_id,meta"),
    getLatestIntegrationRow(userId, "instagram", "instagram", "instagram", "status,resource_id,access_token_enc"),
    getLatestIntegrationRow(userId, "linkedin", "linkedin", "linkedin", "status,resource_id,access_token_enc"),
  ]);

  if (channel === "facebook") {
    const token = tryDecryptToken(String(asRecord(fbRow).access_token_enc ?? "")) || "";
    if (!token) throw new Error("Facebook non configuré.");
    if (previousExternalId) await deleteFacebookPost(previousExternalId, token);
    return;
  }

  if (channel === "instagram") {
    const token = tryDecryptToken(String(asRecord(igRow).access_token_enc ?? "")) || "";
    if (!token) throw new Error("Instagram non configuré.");
    if (previousExternalId) await deleteInstagramMedia(previousExternalId, token);
    return;
  }

  if (channel === "linkedin") {
    const token = tryDecryptToken(String(asRecord(liRow).access_token_enc ?? "")) || "";
    if (!token) throw new Error("LinkedIn non configuré.");
    if (previousExternalId) await deleteLinkedInPost(previousExternalId, token);
    return;
  }

  if (channel === "gmb") {
    const token = await getGmbToken();
    if (!token?.accessToken) throw new Error("Token Google Business invalide.");
    if (previousExternalId) await deleteGmbPost(previousExternalId, token.accessToken);
    return;
  }
}

async function persistEventPayload(userId: string, publicationId: string, nextPayload: JsonRecord | null) {
  const { data: events, error } = await supabaseAdmin
    .from("app_events")
    .select("id,payload")
    .eq("user_id", userId)
    .eq("module", "booster")
    .eq("type", "publish")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  const ids = (events || [])
    .filter((row: any) => String(asRecord(row.payload).publication_id || "") === publicationId)
    .map((row: any) => String(row.id));

  if (!ids.length) return;
  if (!nextPayload) {
    const { error: delError } = await supabaseAdmin.from("app_events").delete().in("id", ids);
    if (delError) throw delError;
    return;
  }

  const { error: upError } = await supabaseAdmin.from("app_events").update({ payload: nextPayload }).in("id", ids);
  if (upError) throw upError;
}

export async function PATCH(req: Request, context: { params: Promise<{ publicationId: string; channel: string }> }) {
  try {
    const { user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const params = await context.params;
    const publicationId = String(params.publicationId || "").trim();
    const channel = normalizeChannelKey(params.channel || "");
    if (!publicationId || !channel) return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as JsonRecord | null;
    if (!body) return NextResponse.json({ error: "Bad payload" }, { status: 400 });

    const ctx = await loadPublicationContext(user.id, publicationId);
    if (!ctx) return NextResponse.json({ error: "Publication introuvable." }, { status: 404 });

    const currentPost = getChannelPost(ctx.eventPayload, ctx.publication, channel);
    const nextPost: PostPayload = {
      title: String(body.title ?? currentPost.title ?? "").trim(),
      content: String(body.content ?? currentPost.content ?? "").trim(),
      cta: String(body.cta ?? currentPost.cta ?? "").trim(),
      hashtags: Array.isArray(body.hashtags)
        ? body.hashtags.map((tag: unknown) => normalizeHashtag(String(tag || ""))).filter(Boolean).slice(0, 20)
        : currentPost.hashtags,
    };

    if (!nextPost.content) return NextResponse.json({ error: "Le contenu est vide." }, { status: 400 });

    const results = asRecord(ctx.eventPayload.results);
    const channelResult = asRecord(results[channel]);
    const previousExternalId = String(body.externalId ?? channelResult.external_id ?? "").trim() || null;

    const replaceResult = await replaceChannelDelivery({
      userId: user.id,
      channel,
      previousExternalId,
      publication: ctx.publication,
      eventPayload: ctx.eventPayload,
      nextPost,
    });

    const nextPayload: JsonRecord = {
      ...ctx.eventPayload,
      channels: Array.from(new Set([...(Array.isArray(ctx.eventPayload.channels) ? ctx.eventPayload.channels : []), channel])),
      postByChannel: {
        ...asRecord(ctx.eventPayload.postByChannel),
        [channel]: nextPost,
      },
      results: {
        ...results,
        [channel]: {
          ...channelResult,
          ok: true,
          external_id: replaceResult.externalId,
          updated_at: new Date().toISOString(),
        },
      },
    };

    await persistEventPayload(user.id, publicationId, nextPayload);

    const { error: deliveryError } = await supabaseAdmin
      .from("publication_deliveries")
      .update({ status: replaceResult.status, error: replaceResult.error })
      .eq("user_id", user.id)
      .eq("publication_id", publicationId)
      .eq("channel", channel);
    if (deliveryError) throw deliveryError;

    return NextResponse.json({ ok: true, publication_id: publicationId, channel, external_id: replaceResult.externalId, payload: nextPayload });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMessage(e, "Erreur") }, { status: 500 });
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ publicationId: string; channel: string }> }) {
  try {
    const { user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const params = await context.params;
    const publicationId = String(params.publicationId || "").trim();
    const channel = normalizeChannelKey(params.channel || "");
    if (!publicationId || !channel) return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });

    const ctx = await loadPublicationContext(user.id, publicationId);
    if (!ctx) return NextResponse.json({ error: "Publication introuvable." }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as JsonRecord;
    const results = asRecord(ctx.eventPayload.results);
    const channelResult = asRecord(results[channel]);
    const previousExternalId = String(body.externalId ?? channelResult.external_id ?? "").trim() || null;

    await removeChannelDelivery({ userId: user.id, channel, previousExternalId });

    const nextChannels = (Array.isArray(ctx.eventPayload.channels) ? ctx.eventPayload.channels : []).filter((item: unknown) => normalizeChannelKey(String(item || "")) !== channel);
    const nextPostByChannel = { ...asRecord(ctx.eventPayload.postByChannel) };
    delete nextPostByChannel[channel];
    const nextResults = { ...results };
    delete nextResults[channel];

    await supabaseAdmin.from("publication_deliveries").delete().eq("user_id", user.id).eq("publication_id", publicationId).eq("channel", channel);

    if (!nextChannels.length) {
      await persistEventPayload(user.id, publicationId, null);
      await supabaseAdmin.from("publication_deliveries").delete().eq("user_id", user.id).eq("publication_id", publicationId);
      await supabaseAdmin.from("publications").delete().eq("user_id", user.id).eq("id", publicationId);
      return NextResponse.json({ ok: true, deleted: true, removed_publication: true });
    }

    const nextPayload: JsonRecord = {
      ...ctx.eventPayload,
      channels: nextChannels,
      postByChannel: nextPostByChannel,
      results: nextResults,
    };

    await persistEventPayload(user.id, publicationId, nextPayload);

    return NextResponse.json({ ok: true, deleted: true, removed_publication: false, payload: nextPayload });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMessage(e, "Erreur") }, { status: 500 });
  }
}
