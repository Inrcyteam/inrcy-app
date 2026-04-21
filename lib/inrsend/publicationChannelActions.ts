import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tryDecryptToken } from "@/lib/oauthCrypto";
import { facebookPublishToPage } from "@/lib/facebookPublish";
import { instagramPublishCarousel, instagramPublishPhoto } from "@/lib/instagramPublish";
import { linkedinPublishImage, linkedinPublishMultiImage, linkedinPublishText } from "@/lib/linkedinPublish";
import { getGmbToken, gmbCreateLocalPost } from "@/lib/googleBusiness";
import { optimizeForGoogleBusiness, optimizeForInstagram, optimizeForSiteCard, optimizeForSocialFeed } from "@/lib/imageOptimizer";
import { createHash, randomUUID } from "crypto";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { buildBoosterGmbSummary, buildBoosterInstagramCaption, buildBoosterMessage, getBoosterGmbCallToAction } from "@/lib/boosterCta";
import { log } from "@/lib/observability/logger";
import { getLinkedInAccessToken } from "@/lib/linkedinOAuth";

const FACEBOOK_GRAPH_VERSION = "v20.0";
const LINKEDIN_VERSION = "202603";

export type ChannelKey = "inrcy_site" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";
type JsonRecord = Record<string, unknown>;

type InstagramDeleteTokenCandidate = {
  source: string;
  token: string;
  preview: string;
};

type AppEventRow = {
  id: string | number;
  payload?: unknown;
  created_at?: string;
};

type PostPayload = {
  title: string;
  content: string;
  cta: string;
  ctaMode?: string;
  ctaUrl?: string;
  ctaPhone?: string;
  hashtags: string[];
  images?: string[];
  attachments?: string[];
  publishableUrls?: string[];
  instagramPublishableUrls?: string[];
  socialFeedPublishableUrls?: string[];
  siteCardPublishableUrls?: string[];
  gmbPublishableUrls?: string[];
};

type ImagePayload = {
  name: string;
  type: string;
  dataUrl: string;
};

type ImageSet = {
  images: string[];
  instagramPublishableUrls: string[];
  socialFeedPublishableUrls: string[];
  siteCardPublishableUrls: string[];
  gmbPublishableUrls: string[];
};

function asRecord(v: unknown): JsonRecord {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : {};
}

function normalizeHashtag(input: string): string {
  return String(input || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .slice(0, 40);
}

function dataUrlToBuffer(dataUrl: string) {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  const mime = match[1];
  const b64 = match[2];
  return { mime, buffer: Buffer.from(b64, "base64") };
}

async function canGoogleFetchImageUrl(url: string): Promise<boolean> {
  const target = String(url || "").trim();
  if (!target) return false;

  for (const method of ["HEAD", "GET"] as const) {
    try {
      const response = await fetch(target, {
        method,
        redirect: "follow",
        cache: "no-store",
      });
      if (!response.ok) continue;
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (contentType.startsWith("image/")) return true;
      if (method === "GET") return false;
    } catch {
      // Ignore and try the next strategy.
    }
  }

  return false;
}

async function getGoogleBusinessPublishableUrl(path: string): Promise<string | null> {
  const publicUrl = String(supabaseAdmin.storage.from("booster").getPublicUrl(path)?.data?.publicUrl || "").trim();
  if (publicUrl && await canGoogleFetchImageUrl(publicUrl)) return publicUrl;

  const signed = await supabaseAdmin.storage.from("booster").createSignedUrl(path, 60 * 60 * 24);
  const signedUrl = String(signed?.data?.signedUrl || "").trim();
  if (signedUrl && await canGoogleFetchImageUrl(signedUrl)) return signedUrl;

  return publicUrl || signedUrl || null;
}

async function uploadPublicationImages(userId: string, newImages: ImagePayload[]): Promise<ImageSet> {
  const uploadedUrls: string[] = [];
  const instagramPublishableUrls: string[] = [];
  const socialFeedPublishableUrls: string[] = [];
  const siteCardPublishableUrls: string[] = [];
  const gmbPublishableUrls: string[] = [];

  for (const img of newImages.slice(0, 5)) {
    const parsed = dataUrlToBuffer(img.dataUrl);
    if (!parsed) throw new Error(`Image invalide : ${img?.name || "image"}.`);

    const ext = (img.name || "image").split(".").pop() || "jpg";
    const originalPath = `${userId}/${randomUUID()}.${ext}`;
    const originalUpload = await supabaseAdmin.storage.from("booster").upload(originalPath, parsed.buffer, {
      contentType: parsed.mime || img.type || "application/octet-stream",
      upsert: false,
    });
    if (originalUpload.error) throw originalUpload.error;

    const originalPublic = supabaseAdmin.storage.from("booster").getPublicUrl(originalPath);
    const originalUrl = String(originalPublic?.data?.publicUrl || "").trim();
    if (!originalUrl) throw new Error(`URL publique introuvable pour ${img?.name || "image"}.`);
    uploadedUrls.push(originalUrl);

    const instagramOptimized = await optimizeForInstagram(parsed.buffer);
    const instagramPath = `${userId}/instagram/${randomUUID()}.${instagramOptimized.extension}`;
    const instagramUpload = await supabaseAdmin.storage.from("booster").upload(instagramPath, instagramOptimized.buffer, {
      contentType: instagramOptimized.mime,
      upsert: false,
    });
    if (instagramUpload.error) throw instagramUpload.error;
    const instagramSigned = await supabaseAdmin.storage.from("booster").createSignedUrl(instagramPath, 60 * 60 * 24);
    const instagramPublic = supabaseAdmin.storage.from("booster").getPublicUrl(instagramPath);
    const instagramUrl = String(instagramSigned?.data?.signedUrl || instagramPublic?.data?.publicUrl || "").trim();
    if (!instagramUrl) throw new Error(`URL Instagram introuvable pour ${img?.name || "image"}.`);
    instagramPublishableUrls.push(instagramUrl);

    const socialOptimized = await optimizeForSocialFeed(parsed.buffer);
    const socialPath = `${userId}/social-feed/${randomUUID()}.${socialOptimized.extension}`;
    const socialUpload = await supabaseAdmin.storage.from("booster").upload(socialPath, socialOptimized.buffer, {
      contentType: socialOptimized.mime,
      upsert: false,
    });
    if (socialUpload.error) throw socialUpload.error;
    const socialSigned = await supabaseAdmin.storage.from("booster").createSignedUrl(socialPath, 60 * 60 * 24);
    const socialPublic = supabaseAdmin.storage.from("booster").getPublicUrl(socialPath);
    const socialUrl = String(socialSigned?.data?.signedUrl || socialPublic?.data?.publicUrl || "").trim();
    if (!socialUrl) throw new Error(`URL social introuvable pour ${img?.name || "image"}.`);
    socialFeedPublishableUrls.push(socialUrl);

    const siteOptimized = await optimizeForSiteCard(parsed.buffer);
    const sitePath = `${userId}/site-card/${randomUUID()}.${siteOptimized.extension}`;
    const siteUpload = await supabaseAdmin.storage.from("booster").upload(sitePath, siteOptimized.buffer, {
      contentType: siteOptimized.mime,
      upsert: false,
    });
    if (siteUpload.error) throw siteUpload.error;
    const siteSigned = await supabaseAdmin.storage.from("booster").createSignedUrl(sitePath, 60 * 60 * 24);
    const sitePublic = supabaseAdmin.storage.from("booster").getPublicUrl(sitePath);
    const siteUrl = String(siteSigned?.data?.signedUrl || sitePublic?.data?.publicUrl || "").trim();
    if (!siteUrl) throw new Error(`URL site introuvable pour ${img?.name || "image"}.`);
    siteCardPublishableUrls.push(siteUrl);

    const gmbOptimized = await optimizeForGoogleBusiness(parsed.buffer);
    const gmbPath = `${userId}/gmb/${randomUUID()}.${gmbOptimized.extension}`;
    const gmbUpload = await supabaseAdmin.storage.from("booster").upload(gmbPath, gmbOptimized.buffer, {
      contentType: gmbOptimized.mime,
      upsert: false,
    });
    if (gmbUpload.error) throw gmbUpload.error;
    const gmbUrl = await getGoogleBusinessPublishableUrl(gmbPath);
    if (!gmbUrl) throw new Error(`URL Google Business introuvable pour ${img?.name || "image"}.`);
    gmbPublishableUrls.push(gmbUrl);
  }

  return { images: uploadedUrls, instagramPublishableUrls, socialFeedPublishableUrls, siteCardPublishableUrls, gmbPublishableUrls };
}

function filterUrlsByIndexes(values: unknown, indexes: number[]): string[] {
  const items = Array.isArray(values) ? values.map((value) => String(value || "").trim()) : [];
  return indexes.map((index) => items[index]).filter(Boolean);
}

function emptyImageSet(): ImageSet {
  return { images: [], instagramPublishableUrls: [], socialFeedPublishableUrls: [], siteCardPublishableUrls: [], gmbPublishableUrls: [] };
}

function getChannelImageSet(eventPayload: JsonRecord, publication: JsonRecord, channel: ChannelKey): ImageSet {
  const postByChannel = asRecord(eventPayload.postByChannel);
  const fallbackChannelPost = channel === "inrcy_site" ? postByChannel.site_web : channel === "site_web" ? postByChannel.inrcy_site : null;
  const raw = asRecord(postByChannel[channel] ?? fallbackChannelPost);
  const publicationImages = Array.isArray(publication.images)
    ? publication.images.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  const images = Array.isArray(raw.images)
    ? raw.images.map((value) => String(value || "").trim()).filter(Boolean)
    : Array.isArray(raw.attachments)
      ? raw.attachments.map((value) => String(value || "").trim()).filter(Boolean)
      : publicationImages;

  const inheritedIndexes = images.map((url) => publicationImages.indexOf(url)).filter((index) => index >= 0);

  return {
    images,
    instagramPublishableUrls: Array.isArray(raw.instagramPublishableUrls)
      ? raw.instagramPublishableUrls.map((value) => String(value || "").trim()).filter(Boolean)
      : filterUrlsByIndexes(eventPayload.instagramPublishableUrls, inheritedIndexes),
    socialFeedPublishableUrls: Array.isArray(raw.socialFeedPublishableUrls)
      ? raw.socialFeedPublishableUrls.map((value) => String(value || "").trim()).filter(Boolean)
      : filterUrlsByIndexes(eventPayload.socialFeedPublishableUrls, inheritedIndexes),
    siteCardPublishableUrls: Array.isArray(raw.siteCardPublishableUrls)
      ? raw.siteCardPublishableUrls.map((value) => String(value || "").trim()).filter(Boolean)
      : filterUrlsByIndexes(eventPayload.siteCardPublishableUrls, inheritedIndexes),
    gmbPublishableUrls: Array.isArray(raw.gmbPublishableUrls)
      ? raw.gmbPublishableUrls.map((value) => String(value || "").trim()).filter(Boolean)
      : filterUrlsByIndexes(eventPayload.gmbPublishableUrls, inheritedIndexes),
  };
}

async function updatePublicationImages(params: {
  userId: string;
  publication: JsonRecord;
  eventPayload: JsonRecord;
  channel: ChannelKey;
  retainedImages?: string[];
  newImages?: ImagePayload[];
}): Promise<ImageSet> {
  const { userId, publication, eventPayload, channel, retainedImages = [], newImages = [] } = params;
  const currentImageSet = getChannelImageSet(eventPayload, publication, channel);
  const currentImages = currentImageSet.images;
  const sanitizedRetained = retainedImages.map((value) => String(value || "").trim()).filter(Boolean);
  const retainedIndexes = sanitizedRetained
    .map((url) => currentImages.indexOf(url))
    .filter((index, position, arr) => index >= 0 && arr.indexOf(index) === position);

  const baseImageSet: ImageSet = {
    images: retainedIndexes.map((index) => currentImages[index]).filter(Boolean),
    instagramPublishableUrls: filterUrlsByIndexes(currentImageSet.instagramPublishableUrls, retainedIndexes),
    socialFeedPublishableUrls: filterUrlsByIndexes(currentImageSet.socialFeedPublishableUrls, retainedIndexes),
    siteCardPublishableUrls: filterUrlsByIndexes(currentImageSet.siteCardPublishableUrls, retainedIndexes),
    gmbPublishableUrls: filterUrlsByIndexes(currentImageSet.gmbPublishableUrls, retainedIndexes),
  };

  const uploadedSet = newImages.length ? await uploadPublicationImages(userId, newImages) : emptyImageSet();
  return {
    images: [...baseImageSet.images, ...uploadedSet.images].slice(0, 5),
    instagramPublishableUrls: [...baseImageSet.instagramPublishableUrls, ...uploadedSet.instagramPublishableUrls].slice(0, 10),
    socialFeedPublishableUrls: [...baseImageSet.socialFeedPublishableUrls, ...uploadedSet.socialFeedPublishableUrls].slice(0, 20),
    siteCardPublishableUrls: [...baseImageSet.siteCardPublishableUrls, ...uploadedSet.siteCardPublishableUrls].slice(0, 20),
    gmbPublishableUrls: [...baseImageSet.gmbPublishableUrls, ...uploadedSet.gmbPublishableUrls].slice(0, 20),
  };
}

function cloneRecord<T extends JsonRecord>(input: T): T {
  return JSON.parse(JSON.stringify(input || {})) as T;
}

function isDeletedResult(result: JsonRecord | null | undefined): boolean {
  if (!result) return false;
  return result.deleted === true || String(result.status || "").toLowerCase() === "deleted";
}

function getChannelPost(eventPayload: JsonRecord, publication: JsonRecord, channel: ChannelKey): PostPayload {
  const postByChannel = asRecord(eventPayload.postByChannel);
  const fallbackChannelPost = channel === "inrcy_site" ? postByChannel.site_web : channel === "site_web" ? postByChannel.inrcy_site : null;
  const raw = asRecord(postByChannel[channel] ?? fallbackChannelPost ?? eventPayload.post);
  const eventPost = asRecord(eventPayload.post);
  const publicationTags = Array.isArray(publication.hashtags) ? publication.hashtags : [];
  const eventPostTags = Array.isArray(eventPost.hashtags) ? eventPost.hashtags : [];
  const rawTags = Array.isArray(raw.hashtags) ? raw.hashtags : eventPostTags.length ? eventPostTags : publicationTags;

  return {
    title: String(raw.title ?? publication.title ?? "").trim(),
    content: String(raw.content ?? raw.text ?? raw.message ?? publication.content ?? "").trim(),
    cta: String(raw.cta ?? publication.cta ?? "").trim(),
    ctaMode: String(raw.ctaMode ?? "").trim(),
    ctaUrl: String(raw.ctaUrl ?? "").trim(),
    ctaPhone: String(raw.ctaPhone ?? "").trim(),
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

  const event = ((events || []) as AppEventRow[]).find((row) => String(asRecord(row.payload).publication_id || "") === publicationId) ?? null;
  const eventPayload = asRecord(event?.payload);

  const { data: delivery, error: deliveryError } = await supabaseAdmin
    .from("publication_deliveries")
    .select("id,status,error,channel")
    .eq("user_id", userId)
    .eq("publication_id", publicationId);

  if (deliveryError) throw deliveryError;

  return {
    publication: asRecord(publication),
    event,
    eventPayload,
    deliveries: Array.isArray(delivery) ? delivery : [],
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

async function updateFacebookPost(externalId: string, pageAccessToken: string, message: string) {
  if (!externalId) throw new Error("Publication Facebook introuvable.");
  const body = new URLSearchParams({ access_token: pageAccessToken, message });
  const res = await fetch(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${encodeURIComponent(externalId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error?.message || `Modification Facebook impossible (${res.status})`);
  }
}

function areImageListsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => String(value || "").trim() === String(right[index] || "").trim());
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
    const meta = extractGraphErrorMeta(json);
    const error = new Error(meta.message || `Suppression Instagram impossible (${res.status})`) as Error & {
      status_code?: number;
      graph_code?: number | null;
      graph_subcode?: number | null;
      fbtrace_id?: string | null;
    };
    error.status_code = res.status;
    error.graph_code = meta.graph_code;
    error.graph_subcode = meta.graph_subcode;
    error.fbtrace_id = meta.fbtrace_id;
    throw error;
  }
}

function previewToken(token: string) {
  if (!token) return "absent";
  const digest = createHash("sha256").update(token).digest("hex").slice(0, 10);
  return `tok_${digest}`;
}

function buildInstagramDeleteTokenCandidates(entries: Array<{ sourceLabel: string; row: unknown }>): InstagramDeleteTokenCandidate[] {
  const candidates: InstagramDeleteTokenCandidate[] = [];
  const seen = new Set<string>();

  const pushCandidate = (source: string, raw: unknown) => {
    const token = tryDecryptToken(String(raw || "")) || "";
    if (!token || seen.has(token)) return;
    seen.add(token);
    candidates.push({ source, token, preview: previewToken(token) });
  };

  for (const entry of entries) {
    const row = asRecord(entry.row);
    const meta = asRecord(row.meta);
    pushCandidate(`${entry.sourceLabel}.access_token_enc`, row.access_token_enc);
    pushCandidate(`${entry.sourceLabel}.meta.standard_user_access_token_enc`, meta.standard_user_access_token_enc);
    pushCandidate(`${entry.sourceLabel}.meta.business_user_access_token_enc`, meta.business_user_access_token_enc);
    pushCandidate(`${entry.sourceLabel}.meta.user_access_token_enc`, meta.user_access_token_enc);
    pushCandidate(`${entry.sourceLabel}.meta.user_access_token`, meta.user_access_token);
  }

  return candidates;
}

function extractGraphErrorMeta(errorLike: unknown) {
  const err = asRecord(asRecord(errorLike).error);
  return {
    message: String(err.message ?? "").trim() || null,
    graph_code: typeof err.code === "number" ? err.code : Number(err.code || 0) || null,
    graph_subcode: typeof err.error_subcode === "number" ? err.error_subcode : Number(err.error_subcode || 0) || null,
    fbtrace_id: String(err.fbtrace_id ?? "").trim() || null,
  };
}

function isInstagramDeletePermissionError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
  return (
    message.includes("insufficient")
    || message.includes("permission")
    || message.includes("access this data")
    || message.includes("not authorized")
    || message.includes("not authorised")
    || message.includes("unsupported request")
    || message.includes("access token")
    || message.includes("oauth")
  );
}

async function deleteInstagramMediaWithFallback(
  externalId: string,
  options: {
    igRow?: unknown;
    fbRow?: unknown;
  } = {},
) {
  if (!externalId) return;
  const candidates = buildInstagramDeleteTokenCandidates([
    { sourceLabel: "instagram", row: options.igRow },
    { sourceLabel: "facebook", row: options.fbRow },
  ]);

  if (!candidates.length) throw new Error("Votre compte Instagram n’est pas encore correctement relié.");

  let lastError: unknown = null;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      await deleteInstagramMedia(externalId, candidate.token);
      log.info("instagram_delete_success", {
        route: "inrsend_instagram_delete",
        external_id: externalId,
        source: candidate.source,
        token_preview: candidate.preview,
      });
      return;
    } catch (error) {
      lastError = error;
      const err = error as Error & {
        status_code?: number;
        graph_code?: number | null;
        graph_subcode?: number | null;
        fbtrace_id?: string | null;
      };

      log.warn("instagram_delete_attempt_failed", {
        route: "inrsend_instagram_delete",
        external_id: externalId,
        source: candidate.source,
        token_preview: candidate.preview,
        status_code: err.status_code,
        graph_code: err.graph_code ?? null,
        graph_subcode: err.graph_subcode ?? null,
        fbtrace_id: err.fbtrace_id ?? null,
        error_message: String(err.message || "Suppression Instagram impossible."),
      });

      const hasNextCandidate = index < candidates.length - 1;
      if (hasNextCandidate && isInstagramDeletePermissionError(error)) continue;
      throw error;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("Suppression Instagram impossible.");
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

async function syncDeliveryRow(params: {
  userId: string;
  publicationId: string;
  channel: ChannelKey;
  status: string;
  error?: string | null;
}) {
  const { userId, publicationId, channel, status, error } = params;
  const { error: upError } = await supabaseAdmin
    .from("publication_deliveries")
    .update({ status, error: error || null })
    .eq("user_id", userId)
    .eq("publication_id", publicationId)
    .eq("channel", channel);

  if (upError) throw upError;
}

async function persistEventPayload(userId: string, publicationId: string, nextPayload: JsonRecord) {
  const { data: events, error } = await supabaseAdmin
    .from("app_events")
    .select("id,payload")
    .eq("user_id", userId)
    .eq("module", "booster")
    .eq("type", "publish")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  const ids = ((events || []) as AppEventRow[])
    .filter((row) => String(asRecord(row.payload).publication_id || "") === publicationId)
    .map((row) => String(row.id));

  if (!ids.length) return;
  const { error: upError } = await supabaseAdmin.from("app_events").update({ payload: nextPayload }).in("id", ids);
  if (upError) throw upError;
}

async function replaceChannelDelivery(params: {
  userId: string;
  channel: ChannelKey;
  previousExternalId?: string | null;
  publication: JsonRecord;
  eventPayload: JsonRecord;
  nextPost: PostPayload;
  imageSet?: ImageSet | null;
}) {
  const { userId, channel, previousExternalId, publication, eventPayload, nextPost, imageSet } = params;
  const resolvedImageSet = imageSet ?? getChannelImageSet(eventPayload, publication, channel);
  const images = resolvedImageSet.images;
  const socialFeedImageUrls = resolvedImageSet.socialFeedPublishableUrls.length ? resolvedImageSet.socialFeedPublishableUrls : images;
  const instagramImageUrls = resolvedImageSet.instagramPublishableUrls.length ? resolvedImageSet.instagramPublishableUrls : images;
  const siteCardImageUrls = resolvedImageSet.siteCardPublishableUrls.length ? resolvedImageSet.siteCardPublishableUrls : socialFeedImageUrls;
  const gmbImageUrls = resolvedImageSet.gmbPublishableUrls.length ? resolvedImageSet.gmbPublishableUrls : socialFeedImageUrls;

  const [profileRes, inrcyCfgRes, proCfgRes] = await Promise.all([
    supabaseAdmin.from("profiles").select("phone").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("inrcy_site_configs").select("site_url").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
  ]);
  const profile = asRecord(profileRes.data);
  const inrcyCfg = asRecord(inrcyCfgRes.data);
  const proCfg = asRecord(proCfgRes.data);
  const proSettings = asRecord(proCfg.settings);
  const proSiteWeb = asRecord(proSettings.site_web);
  const websiteUrl = String(proSiteWeb.url ?? inrcyCfg.site_url ?? "").trim();
  const phone = String(profile.phone ?? "").trim();

  const canonMessage = buildBoosterMessage(channel, nextPost, { websiteUrl, phone });

  if (channel === "inrcy_site" || channel === "site_web") {
    const { data: article, error: articleError } = await supabaseAdmin
      .from("site_articles")
      .update({
        title: nextPost.title,
        content: nextPost.content,
        cta: nextPost.cta,
        hashtags: nextPost.hashtags,
        images: siteCardImageUrls.length ? siteCardImageUrls : images,
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
    getLatestIntegrationRow(userId, "facebook", "facebook", "facebook", "status,resource_id,access_token_enc,meta,expires_at"),
    getLatestIntegrationRow(userId, "google", "gmb", "gmb", "status,resource_id,meta,expires_at"),
    getLatestIntegrationRow(userId, "instagram", "instagram", "instagram", "status,resource_id,access_token_enc,resource_label,meta,expires_at"),
    getLatestIntegrationRow(userId, "linkedin", "linkedin", "linkedin", "status,resource_id,access_token_enc,meta,expires_at"),
  ]);

  if (channel === "facebook") {
    const fb = asRecord(fbRow);
    const pageId = String(fb.resource_id ?? "");
    const pageToken = tryDecryptToken(String(fb.access_token_enc ?? "")) || "";
    if (String(fb.status ?? "") !== "connected" || !pageId || !pageToken) throw new Error("Votre compte Facebook n’est pas encore correctement relié.");

    const currentImageSet = getChannelImageSet(eventPayload, publication, channel);
    const facebookImagesChanged = !areImageListsEqual(currentImageSet.images, resolvedImageSet.images);

    if (previousExternalId && !facebookImagesChanged) {
      try {
        await updateFacebookPost(previousExternalId, pageToken, canonMessage);
        return { externalId: previousExternalId, status: "delivered", error: null };
      } catch {
        await deleteFacebookPost(previousExternalId, pageToken);
      }
    } else if (previousExternalId) {
      await deleteFacebookPost(previousExternalId, pageToken);
    }

    const resp = await facebookPublishToPage({ pageId, pageAccessToken: pageToken, message: canonMessage, imageUrls: socialFeedImageUrls });
    if (!resp.ok) throw new Error(resp.error);
    return { externalId: resp.postId, status: "delivered", error: null };
  }

  if (channel === "instagram") {
    const ig = asRecord(igRow);
    const igUserId = String(ig.resource_id ?? "");
    const igToken = tryDecryptToken(String(ig.access_token_enc ?? "")) || "";
    if (String(ig.status ?? "") !== "connected" || !igUserId || !igToken) throw new Error("Votre compte Instagram n’est pas encore correctement relié.");
    const instagramImages = instagramImageUrls.filter(Boolean).slice(0, 10);
    if (!instagramImages.length) throw new Error("Instagram nécessite au moins 1 image.");
    if (previousExternalId) await deleteInstagramMediaWithFallback(previousExternalId, { igRow, fbRow });
    const resp = instagramImages.length > 1
      ? await instagramPublishCarousel({
          igUserId,
          accessToken: igToken,
          caption: buildBoosterInstagramCaption(nextPost, { websiteUrl, phone }),
          imageUrls: instagramImages,
        })
      : await instagramPublishPhoto({
          igUserId,
          accessToken: igToken,
          caption: buildBoosterInstagramCaption(nextPost, { websiteUrl, phone }),
          imageUrl: instagramImages[0],
        });
    if (!resp.ok) throw new Error(resp.error);
    return { externalId: resp.mediaId, status: "delivered", error: null };
  }

  if (channel === "linkedin") {
    const li = asRecord(liRow);
    const auth = await getLinkedInAccessToken({ userId });
    const accessToken = auth.accessToken || "";
    const authorUrn = auth.orgUrn || auth.authorUrn || String(asRecord(li.meta).org_urn ?? li.resource_id ?? "");
    if (String(li.status ?? "") !== "connected" || !accessToken || !authorUrn) {
      throw new Error(auth.error || "Votre compte LinkedIn n’est pas encore correctement relié.");
    }
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
    if (String(gmb.status ?? "") !== "connected" || !accountName || !locationName) throw new Error("Votre fiche Google Business n’est pas encore correctement reliée.");
    const token = await getGmbToken();
    if (!token?.accessToken) throw new Error("La connexion Google a expiré. Merci de reconnecter votre compte.");
    if (previousExternalId) await deleteGmbPost(previousExternalId, token.accessToken);
    const resp = await gmbCreateLocalPost({
      accessToken: token.accessToken,
      accountName,
      locationName,
      summary: buildBoosterGmbSummary(nextPost),
      imageUrls: gmbImageUrls,
      languageCode: "fr-FR",
      callToAction: getBoosterGmbCallToAction(nextPost, { websiteUrl, phone }) || undefined,
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

  const [fbRow, _gmbRow, igRow, liRow] = await Promise.all([
    getLatestIntegrationRow(userId, "facebook", "facebook", "facebook", "status,resource_id,access_token_enc,meta"),
    getLatestIntegrationRow(userId, "google", "gmb", "gmb", "status,resource_id,meta"),
    getLatestIntegrationRow(userId, "instagram", "instagram", "instagram", "status,resource_id,access_token_enc,meta"),
    getLatestIntegrationRow(userId, "linkedin", "linkedin", "linkedin", "status,resource_id,access_token_enc"),
  ]);

  if (channel === "facebook") {
    const token = tryDecryptToken(String(asRecord(fbRow).access_token_enc ?? "")) || "";
    if (!token) throw new Error("Votre compte Facebook n’est pas encore correctement relié.");
    if (previousExternalId) await deleteFacebookPost(previousExternalId, token);
    return;
  }

  if (channel === "instagram") {
    const candidates = buildInstagramDeleteTokenCandidates([{ sourceLabel: "instagram", row: igRow }, { sourceLabel: "facebook", row: fbRow }]);
    if (!candidates.length) throw new Error("Votre compte Instagram n’est pas encore correctement relié.");
    if (previousExternalId) await deleteInstagramMediaWithFallback(previousExternalId, { igRow, fbRow });
    return;
  }

  if (channel === "linkedin") {
    const auth = await getLinkedInAccessToken({ userId });
    const token = auth.accessToken || "";
    if (!token) throw new Error(auth.error || "Votre compte LinkedIn n’est pas encore correctement relié.");
    if (previousExternalId) await deleteLinkedInPost(previousExternalId, token);
    return;
  }

  if (channel === "gmb") {
    const token = await getGmbToken();
    if (!token?.accessToken) throw new Error("La connexion Google a expiré. Merci de reconnecter votre compte.");
    if (previousExternalId) await deleteGmbPost(previousExternalId, token.accessToken);
  }
}

function buildUpdatedPayload(params: {
  eventPayload: JsonRecord;
  publication: JsonRecord;
  channel: ChannelKey;
  nextPost: PostPayload;
  externalId: string | null;
  imageSet?: ImageSet | null;
}) {
  const { eventPayload, publication, channel, nextPost, externalId, imageSet } = params;
  const results = cloneRecord(asRecord(eventPayload.results));
  const channelResult = asRecord(results[channel]);
  results[channel] = {
    ...channelResult,
    ok: true,
    status: "delivered",
    deleted: false,
    error: null,
    external_id: externalId,
    updated_at: new Date().toISOString(),
  };

  const currentPostByChannel = asRecord(eventPayload.postByChannel);
  const currentChannelPost = asRecord(currentPostByChannel[channel]);
  const nextChannelPost: JsonRecord = {
    ...currentChannelPost,
    ...nextPost,
  };

  if (imageSet) {
    nextChannelPost.images = imageSet.images;
    nextChannelPost.attachments = imageSet.images;
    nextChannelPost.publishableUrls = imageSet.images;
    nextChannelPost.instagramPublishableUrls = imageSet.instagramPublishableUrls;
    nextChannelPost.socialFeedPublishableUrls = imageSet.socialFeedPublishableUrls;
    nextChannelPost.siteCardPublishableUrls = imageSet.siteCardPublishableUrls;
    nextChannelPost.gmbPublishableUrls = imageSet.gmbPublishableUrls;
  }

  const nextPayload: JsonRecord = {
    ...eventPayload,
    channels: Array.from(new Set([...(Array.isArray(eventPayload.channels) ? eventPayload.channels : []), channel])),
    postByChannel: {
      ...currentPostByChannel,
      [channel]: nextChannelPost,
    },
    post: channel === "inrcy_site" || channel === "site_web" ? asRecord(eventPayload.post) : eventPayload.post,
    results,
  };

  if (!asRecord(nextPayload.post).title && !asRecord(nextPayload.post).content) {
    nextPayload.post = getChannelPost(eventPayload, publication, channel);
  }

  return nextPayload;
}

function buildDeletedPayload(params: {
  eventPayload: JsonRecord;
  channel: ChannelKey;
  previousExternalId: string | null;
}) {
  const { eventPayload, channel, previousExternalId } = params;
  const results = cloneRecord(asRecord(eventPayload.results));
  const channelResult = asRecord(results[channel]);
  results[channel] = {
    ...channelResult,
    ok: false,
    status: "deleted",
    deleted: true,
    error: null,
    deleted_at: new Date().toISOString(),
    external_id: previousExternalId || channelResult.external_id || null,
  };

  return {
    ...eventPayload,
    channels: Array.from(new Set([...(Array.isArray(eventPayload.channels) ? eventPayload.channels : []), channel])),
    results,
  } as JsonRecord;
}

export function createPublicationChannelHandlers(channel: ChannelKey) {
  async function PATCH(req: Request, context: { params: Promise<{ publicationId: string }> }) {
    try {
      const { user, errorResponse } = await requireUser();
      if (errorResponse) return errorResponse;

      const params = await context.params;
      const publicationId = String(params.publicationId || "").trim();
      if (!publicationId) return jsonUserFacingError("Paramètres invalides.", { status: 400, code: "invalid_input" });

      const body = (await req.json().catch(() => null)) as JsonRecord | null;
      if (!body) return jsonUserFacingError("Bad payload", { status: 400, code: "invalid_payload" });

      const ctx = await loadPublicationContext(user.id, publicationId);
      if (!ctx) return jsonUserFacingError("Publication introuvable.", { status: 404, code: "publication_not_found" });

      const results = asRecord(ctx.eventPayload.results);
      const channelResult = asRecord(results[channel]);
      if (isDeletedResult(channelResult)) {
        return jsonUserFacingError("Ce canal est déjà supprimé.", { status: 409, code: "channel_already_deleted" });
      }

      const currentPost = getChannelPost(ctx.eventPayload, ctx.publication, channel);
      const nextPost: PostPayload = {
        title: String(body.title ?? currentPost.title ?? "").trim(),
        content: String(body.content ?? currentPost.content ?? "").trim(),
        cta: String(body.cta ?? currentPost.cta ?? "").trim(),
        ctaMode: String(body.ctaMode ?? currentPost.ctaMode ?? "").trim(),
        ctaUrl: String(body.ctaUrl ?? currentPost.ctaUrl ?? "").trim(),
        ctaPhone: String(body.ctaPhone ?? currentPost.ctaPhone ?? "").trim(),
        hashtags: Array.isArray(body.hashtags)
          ? body.hashtags.map((tag: unknown) => normalizeHashtag(String(tag || ""))).filter(Boolean).slice(0, 20)
          : currentPost.hashtags,
      };

      const retainedImages = Array.isArray(body.retainedImages)
        ? body.retainedImages.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : getChannelImageSet(ctx.eventPayload, ctx.publication, channel).images;
      const newImages = Array.isArray(body.newImages)
        ? body.newImages
            .map((value: unknown) => asRecord(value))
            .map((value) => ({
              name: String(value.name ?? "image").trim() || "image",
              type: String(value.type ?? "image/jpeg").trim() || "image/jpeg",
              dataUrl: String(value.dataUrl ?? "").trim(),
            }))
            .filter((value) => value.dataUrl)
        : [];
      if (retainedImages.length + newImages.length > 5) {
        return jsonUserFacingError("Maximum 5 images par publication.", { status: 400, code: "too_many_images" });
      }

      const imageSet = await updatePublicationImages({
        userId: user.id,
        publication: ctx.publication,
        eventPayload: ctx.eventPayload,
        channel,
        retainedImages,
        newImages,
      });

      const previousExternalId = String(body.externalId ?? channelResult.external_id ?? "").trim() || null;
      const replaceResult = await replaceChannelDelivery({
        userId: user.id,
        channel,
        previousExternalId,
        publication: ctx.publication,
        eventPayload: ctx.eventPayload,
        nextPost,
        imageSet,
      });

      const nextPayload = buildUpdatedPayload({
        eventPayload: ctx.eventPayload,
        publication: ctx.publication,
        channel,
        nextPost,
        externalId: replaceResult.externalId,
        imageSet,
      });

      await persistEventPayload(user.id, publicationId, nextPayload);
      await syncDeliveryRow({ userId: user.id, publicationId, channel, status: replaceResult.status, error: replaceResult.error });

      return NextResponse.json({ ok: true, publication_id: publicationId, channel, external_id: replaceResult.externalId, payload: nextPayload });
    } catch (e: unknown) {
      return jsonUserFacingError(e, { status: 500, fallback: "La modification de la publication a échoué.", code: "publication_update_failed" });
    }
  }

  async function DELETE(req: Request, context: { params: Promise<{ publicationId: string }> }) {
    try {
      const { user, errorResponse } = await requireUser();
      if (errorResponse) return errorResponse;

      const params = await context.params;
      const publicationId = String(params.publicationId || "").trim();
      if (!publicationId) return jsonUserFacingError("Paramètres invalides.", { status: 400, code: "invalid_input" });

      const ctx = await loadPublicationContext(user.id, publicationId);
      if (!ctx) return jsonUserFacingError("Publication introuvable.", { status: 404, code: "publication_not_found" });

      const body = (await req.json().catch(() => ({}))) as JsonRecord;
      const results = asRecord(ctx.eventPayload.results);
      const channelResult = asRecord(results[channel]);
      const previousExternalId = String(body.externalId ?? channelResult.external_id ?? "").trim() || null;

      if (isDeletedResult(channelResult)) {
        const payload = buildDeletedPayload({ eventPayload: ctx.eventPayload, channel, previousExternalId });
        return NextResponse.json({ ok: true, deleted: true, removed_publication: false, payload });
      }

      await removeChannelDelivery({ userId: user.id, channel, previousExternalId });

      const nextPayload = buildDeletedPayload({ eventPayload: ctx.eventPayload, channel, previousExternalId });
      await persistEventPayload(user.id, publicationId, nextPayload);
      await syncDeliveryRow({ userId: user.id, publicationId, channel, status: "deleted", error: null });

      return NextResponse.json({ ok: true, deleted: true, removed_publication: false, payload: nextPayload });
    } catch (e: unknown) {
      return jsonUserFacingError(e, { status: 500, fallback: "La suppression de la publication a échoué.", code: "publication_delete_failed" });
    }
  }

  return { PATCH, DELETE };
}
