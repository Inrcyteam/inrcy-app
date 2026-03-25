import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { enforceRateLimit } from "@/lib/rateLimit";
import { tryDecryptToken } from "@/lib/oauthCrypto";
import { randomUUID } from "crypto";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { facebookPublishToPage } from "@/lib/facebookPublish";
import { instagramPublishCarousel, instagramPublishPhoto } from "@/lib/instagramPublish";
import { linkedinPublishImage, linkedinPublishMultiImage, linkedinPublishText } from "@/lib/linkedinPublish";
import { getGmbToken, gmbCreateLocalPost } from "@/lib/googleBusiness";
import { optimizeForInstagram, optimizeForSiteCard, optimizeForSocialFeed } from "@/lib/imageOptimizer";

type ChannelKey = "inrcy_site" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";

type JsonRecord = Record<string, unknown>;
const asRecord = (v: unknown): JsonRecord =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : {};
const errMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

function slugify(input: string): string {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

type ImagePayload = {
  name: string;
  type: string;
  dataUrl: string; // base64 data URL
};

type PostPayload = {
  title: string;
  content: string;
  cta: string;
  hashtags?: string[];
};

type PostByChannel = Partial<Record<ChannelKey, PostPayload>>;
type ImagesByChannel = Partial<Record<ChannelKey, ImagePayload[]>>;
type ImageSet = {
  images: string[];
  publishableUrls: string[];
  instagramPublishableUrls: string[];
  socialFeedPublishableUrls: string[];
  siteCardPublishableUrls: string[];
};

function dataUrlToBuffer(dataUrl: string) {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  const mime = match[1];
  const b64 = match[2];
  return { mime, buffer: Buffer.from(b64, "base64") };
}

function buildCanonMessage(title: string, content: string, cta: string) {
  const parts = [];
  if (title) parts.push(title);
  if (content) parts.push(content);
  if (cta) parts.push(cta);
  return parts.join("\n\n").trim();
}

function normalizeHashtag(input: string): string {
  return String(input || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .slice(0, 40);
}

function buildInstagramCaption(title: string, content: string, cta: string, hashtags: string[] = []) {
  const base = buildCanonMessage(title, content, cta);
  const cleanTags = hashtags
    .map(normalizeHashtag)
    .filter(Boolean)
    .slice(0, 8)
    .map((tag) => `#${tag}`);

  const full = cleanTags.length ? `${base}

${cleanTags.join(" ")}`.trim() : base;
  return full.slice(0, 2200);
}

function isExpired(expiresAt: unknown, skewSeconds = 60) {
  const iso = String(expiresAt || "").trim();
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t <= Date.now() + skewSeconds * 1000;
}


async function uploadImageSet(userId: string, images: ImagePayload[]): Promise<{ imageSet: ImageSet; uploadErrors: Array<{ name: string; reason: string; stage: string }> }> {
  const uploadedUrls: string[] = [];
  const publishableUrls: string[] = [];
  const instagramPublishableUrls: string[] = [];
  const socialFeedPublishableUrls: string[] = [];
  const siteCardPublishableUrls: string[] = [];
  const uploadErrors: Array<{ name: string; reason: string; stage: string }> = [];

  for (const img of images.slice(0, 5)) {
    const parsed = dataUrlToBuffer(img.dataUrl);
    if (!parsed) {
      uploadErrors.push({ name: img?.name || "image", reason: "Invalid dataUrl (expected data:*;base64,...)", stage: "parse" });
      continue;
    }

    const ext = (img.name || "image").split(".").pop() || "jpg";
    const path = `${userId}/${randomUUID()}.${ext}`;

    const up = await supabaseAdmin.storage.from("booster").upload(path, parsed.buffer, {
      contentType: parsed.mime || img.type || "application/octet-stream",
      upsert: false,
    });

    if (up.error) {
      console.error("[Booster] Storage upload error:", up.error.message, { path, name: img.name });
      uploadErrors.push({ name: img?.name || "image", reason: up.error.message, stage: "upload" });
      continue;
    }

    const pub = supabaseAdmin.storage.from("booster").getPublicUrl(path);
    if (pub?.data?.publicUrl) {
      uploadedUrls.push(pub.data.publicUrl);
    } else {
      uploadErrors.push({ name: img?.name || "image", reason: "getPublicUrl returned empty", stage: "publicUrl" });
    }

    const signed = await supabaseAdmin.storage.from("booster").createSignedUrl(path, 60 * 60 * 24);
    if (signed?.data?.signedUrl) {
      publishableUrls.push(signed.data.signedUrl);
    } else if (pub?.data?.publicUrl) {
      publishableUrls.push(pub.data.publicUrl);
      uploadErrors.push({ name: img?.name || "image", reason: "createSignedUrl failed, fell back to publicUrl", stage: "signedUrl" });
    } else {
      uploadErrors.push({ name: img?.name || "image", reason: "createSignedUrl failed and no publicUrl available", stage: "signedUrl" });
    }

    try {
      const optimized = await optimizeForInstagram(parsed.buffer);
      const igPath = `${userId}/instagram/${randomUUID()}.${optimized.extension}`;
      const igUpload = await supabaseAdmin.storage.from("booster").upload(igPath, optimized.buffer, {
        contentType: optimized.mime,
        upsert: false,
      });

      if (igUpload.error) {
        uploadErrors.push({ name: img?.name || "image", reason: igUpload.error.message, stage: "instagramUpload" });
      } else {
        const igSigned = await supabaseAdmin.storage.from("booster").createSignedUrl(igPath, 60 * 60 * 24);
        const igPublic = supabaseAdmin.storage.from("booster").getPublicUrl(igPath);
        if (igSigned?.data?.signedUrl) {
          instagramPublishableUrls.push(igSigned.data.signedUrl);
        } else if (igPublic?.data?.publicUrl) {
          instagramPublishableUrls.push(igPublic.data.publicUrl);
        } else {
          uploadErrors.push({ name: img?.name || "image", reason: "Instagram optimized image URL unavailable", stage: "instagramUpload" });
        }
      }
    } catch (optErr) {
      uploadErrors.push({
        name: img?.name || "image",
        reason: errMessage(optErr, "Instagram image optimization failed"),
        stage: "instagramOptimize",
      });
    }

    try {
      const optimized = await optimizeForSocialFeed(parsed.buffer);
      const socialPath = `${userId}/social-feed/${randomUUID()}.${optimized.extension}`;
      const socialUpload = await supabaseAdmin.storage.from("booster").upload(socialPath, optimized.buffer, {
        contentType: optimized.mime,
        upsert: false,
      });

      if (socialUpload.error) {
        uploadErrors.push({ name: img?.name || "image", reason: socialUpload.error.message, stage: "socialFeedUpload" });
      } else {
        const socialSigned = await supabaseAdmin.storage.from("booster").createSignedUrl(socialPath, 60 * 60 * 24);
        const socialPublic = supabaseAdmin.storage.from("booster").getPublicUrl(socialPath);
        if (socialSigned?.data?.signedUrl) {
          socialFeedPublishableUrls.push(socialSigned.data.signedUrl);
        } else if (socialPublic?.data?.publicUrl) {
          socialFeedPublishableUrls.push(socialPublic.data.publicUrl);
        } else {
          uploadErrors.push({ name: img?.name || "image", reason: "Social feed optimized image URL unavailable", stage: "socialFeedUpload" });
        }
      }
    } catch (optErr) {
      uploadErrors.push({
        name: img?.name || "image",
        reason: errMessage(optErr, "Social feed image optimization failed"),
        stage: "socialFeedOptimize",
      });
    }

    try {
      const optimized = await optimizeForSiteCard(parsed.buffer);
      const sitePath = `${userId}/site-card/${randomUUID()}.${optimized.extension}`;
      const siteUpload = await supabaseAdmin.storage.from("booster").upload(sitePath, optimized.buffer, {
        contentType: optimized.mime,
        upsert: false,
      });

      if (siteUpload.error) {
        uploadErrors.push({ name: img?.name || "image", reason: siteUpload.error.message, stage: "siteCardUpload" });
      } else {
        const siteSigned = await supabaseAdmin.storage.from("booster").createSignedUrl(sitePath, 60 * 60 * 24);
        const sitePublic = supabaseAdmin.storage.from("booster").getPublicUrl(sitePath);
        if (siteSigned?.data?.signedUrl) {
          siteCardPublishableUrls.push(siteSigned.data.signedUrl);
        } else if (sitePublic?.data?.publicUrl) {
          siteCardPublishableUrls.push(sitePublic.data.publicUrl);
        } else {
          uploadErrors.push({ name: img?.name || "image", reason: "Site card optimized image URL unavailable", stage: "siteCardUpload" });
        }
      }
    } catch (optErr) {
      uploadErrors.push({
        name: img?.name || "image",
        reason: errMessage(optErr, "Site card image optimization failed"),
        stage: "siteCardOptimize",
      });
    }
  }

  return {
    imageSet: {
      images: uploadedUrls,
      publishableUrls,
      instagramPublishableUrls,
      socialFeedPublishableUrls,
      siteCardPublishableUrls,
    },
    uploadErrors,
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

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    const userId = user.id;

    const rl = await enforceRateLimit({ name: "booster_publish", identifier: userId, limit: 20, window: "1 m" });
    if (rl) return rl;
const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Bad payload" }, { status: 400 });

    const channels = (Array.isArray(body.channels) ? body.channels : []) as ChannelKey[];
    const post = (body.post || {}) as PostPayload;
    const postByChannel = ((body.postByChannel || {}) as PostByChannel) || {};
    const idea = String(body.idea || "").trim();
    const images = (Array.isArray(body.images) ? body.images : []) as ImagePayload[];
    const imagesByChannel = ((body.imagesByChannel || {}) as ImagesByChannel) || {};
    const imageSettingsByChannel = (body.imageSettingsByChannel || {}) as Record<string, unknown>;

    const selected = Array.from(new Set(channels)).filter(Boolean);
    if (!selected.length) {
      return NextResponse.json({ error: "Sélectionnez au moins 1 canal." }, { status: 400 });
    }

    const fallbackTitle = String(post.title || "").trim();
    const fallbackContent = String(post.content || "").trim();
    const fallbackCta = String(post.cta || "").trim();
    const fallbackHashtags = Array.isArray(post.hashtags)
      ? post.hashtags.map((h) => normalizeHashtag(String(h || ""))).filter(Boolean).slice(0, 20)
      : [];

    const getChannelPost = (channel: ChannelKey): PostPayload => {
      const raw = ((channel === "inrcy_site" ? postByChannel?.inrcy_site || postByChannel?.site_web : channel === "site_web" ? postByChannel?.site_web || postByChannel?.inrcy_site : postByChannel?.[channel]) || {}) as PostPayload;
      const title = String(raw.title || fallbackTitle || "").trim();
      const content = String(raw.content || fallbackContent || "").trim();
      const cta = String(raw.cta || fallbackCta || "").trim();
      const hashtags = Array.isArray(raw.hashtags)
        ? raw.hashtags.map((h) => normalizeHashtag(String(h || ""))).filter(Boolean).slice(0, 20)
        : fallbackHashtags;
      return { title, content, cta, hashtags };
    };

    const firstPost = getChannelPost(selected[0]);
    if (!firstPost.content) {
      return NextResponse.json({ error: "Le contenu est vide." }, { status: 400 });
    }

    // 1) Upload images to Supabase Storage (bucket: booster) + collect diagnostics
    const { imageSet: baseImageSet, uploadErrors } = await uploadImageSet(userId, images);
    const uploadedUrls = baseImageSet.images;
    const publishableUrls = baseImageSet.publishableUrls;
    const instagramPublishableUrls = baseImageSet.instagramPublishableUrls;
    const socialFeedPublishableUrls = baseImageSet.socialFeedPublishableUrls;
    const siteCardPublishableUrls = baseImageSet.siteCardPublishableUrls;

    const channelImageSets: Partial<Record<ChannelKey, ImageSet>> = {};
    for (const channel of selected) {
      const rawChannelImages = Array.isArray(imagesByChannel?.[channel]) ? (imagesByChannel[channel] as ImagePayload[]) : [];
      if (!rawChannelImages.length) continue;
      const { imageSet, uploadErrors: channelErrors } = await uploadImageSet(userId, rawChannelImages);
      channelImageSets[channel] = imageSet;
      uploadErrors.push(...channelErrors.map((entry) => ({ ...entry, stage: `${channel}:${entry.stage}` })));
    }

    // Optional hard fail if user selected images but none uploaded
    if (images.length > 0 && uploadedUrls.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Images sélectionnées mais upload Supabase impossible.", uploadErrors },
        { status: 400 }
      );
    }
    // 2) Persist publication
    const publicationId = randomUUID();

    const { error: pubErr } = await supabaseAdmin.from("publications").insert({
      id: publicationId,
      user_id: userId,
      title: firstPost.title,
      content: firstPost.content,
      cta: firstPost.cta,
      hashtags: firstPost.hashtags,
      images: uploadedUrls,
      idea,
    });

    if (pubErr) {
      return NextResponse.json({ error: pubErr.message, uploadErrors }, { status: 500 });
    }

    // 3) Create deliveries
    const deliveries = selected.map((ch) => ({
      id: randomUUID(),
      publication_id: publicationId,
      user_id: userId,
      channel: ch,
      status: "queued" as const,
    }));

    await supabaseAdmin.from("publication_deliveries").insert(deliveries);

    // 4) Publish now
    const results: Record<string, unknown> = {};

    const [fbRow, gmbRow, igRow, liRow] = await Promise.all([
      getLatestIntegrationRow(userId, "facebook", "facebook", "facebook", "status,resource_id,access_token_enc,expires_at"),
      getLatestIntegrationRow(userId, "google", "gmb", "gmb", "status,resource_id,meta,expires_at"),
      getLatestIntegrationRow(userId, "instagram", "instagram", "instagram", "status,resource_id,access_token_enc,resource_label,meta,expires_at"),
      getLatestIntegrationRow(userId, "linkedin", "linkedin", "linkedin", "status,resource_id,access_token_enc,meta,expires_at"),
    ]);

    // Internal channel configuration (URLs)
    const [profileRes, inrcyCfgRes, proCfgRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("inrcy_site_ownership,inrcy_site_url").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("inrcy_site_configs").select("site_url").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
    ]);
    const profile = asRecord(profileRes.data);
    const inrcyCfg = asRecord(inrcyCfgRes.data);
    const proCfg = asRecord(proCfgRes.data);
    const proSettings = asRecord(proCfg["settings"]);
    const proSiteWeb = asRecord(proSettings["site_web"]);

    const ownership = String(profile["inrcy_site_ownership"] ?? "none");
    const inrcySiteUrl = String(profile["inrcy_site_url"] ?? inrcyCfg["site_url"] ?? "").trim();
    const siteWebUrl = String(proSiteWeb["url"] ?? "").trim();

    const externalImageUrls = (publishableUrls.length ? publishableUrls : uploadedUrls).slice(0, 5);
    const socialFeedImageUrls = (socialFeedPublishableUrls.length ? socialFeedPublishableUrls : externalImageUrls).slice(0, 5);
    const instagramImageUrls = (instagramPublishableUrls.length ? instagramPublishableUrls : socialFeedImageUrls.length ? socialFeedImageUrls : externalImageUrls).slice(0, 5);

    const getChannelImageSet = (channel: ChannelKey): ImageSet => channelImageSets[channel] || baseImageSet;

    async function setDelivery(channel: ChannelKey, patch: JsonRecord) {
      const nextStatus = String(patch.status ?? "").trim();
      const nextError = String(patch.error ?? patch.last_error ?? "").trim();
      const payload: JsonRecord = {};
      if (nextStatus) payload.status = nextStatus;
      payload.error = nextError || null;

      const { error } = await supabaseAdmin
        .from("publication_deliveries")
        .update(payload)
        .eq("publication_id", publicationId)
        .eq("user_id", userId)
        .eq("channel", channel);

      if (error) {
        console.error("[Booster] publication_deliveries update failed", { channel, payload, error: error.message });
      }
    }

    for (const ch of selected) {
      try {
        const channelPost = getChannelPost(ch);
        const canonMessage = buildCanonMessage(channelPost.title, channelPost.content, channelPost.cta);
        if (ch === "inrcy_site" || ch === "site_web") {
          // We treat "publication" as an "article/actu" for the site.
          // This creates a record that your iNrCy site renderer (or your pro's website connector)
          // can consume to display the article.
          const targetUrl = ch === "inrcy_site" ? inrcySiteUrl : siteWebUrl;
          if (ch === "inrcy_site" && (ownership === "none" || !targetUrl)) {
            await setDelivery(ch, { status: "failed", error: "Site iNrCy non connecté (ownership/url manquants)" });
            results[ch] = { ok: false, error: "not_configured" };
            continue;
          }
          if (ch === "site_web" && !targetUrl) {
            await setDelivery(ch, { status: "failed", error: "Site web non connecté (url manquante)" });
            results[ch] = { ok: false, error: "not_configured" };
            continue;
          }

          const articleId = randomUUID();
          const slug = slugify(channelPost.title) || "actu";
          const externalUrl = targetUrl
            ? `${targetUrl.replace(/\/+$/g, "")}/actu/${slug}-${articleId}`
            : null;

          // IMPORTANT: keep this insert compatible with your current `public.site_articles` table.
          // Your table currently contains at least: id, created_at, user_id, source, title, content.
          // (If you later add more columns, you can extend this insert.)
          const { error: artErr } = await supabaseAdmin.from("site_articles").insert({
            id: articleId,
            user_id: userId,
            source: ch,
            title: channelPost.title,
            content: channelPost.content,
            cta: channelPost.cta,
            hashtags: channelPost.hashtags,
            images: (() => {
              const channelImageSet = getChannelImageSet(ch);
              return channelImageSet.siteCardPublishableUrls.length
                ? channelImageSet.siteCardPublishableUrls
                : channelImageSet.socialFeedPublishableUrls.length
                  ? channelImageSet.socialFeedPublishableUrls
                  : channelImageSet.images;
            })(),
            external_url: externalUrl,     // ✅ si tu veux (optionnel)
            site_url: targetUrl || null,   // ✅ si tu veux (optionnel)
          });

          if (artErr) {
            await setDelivery(ch, { status: "failed", error: `Impossible de créer l'article (${artErr.message})` });
            results[ch] = { ok: false, error: artErr.message };
            continue;
          }

          await setDelivery(ch, {
            status: "delivered",
            error: null,
          });
          results[ch] = { ok: true, external_id: articleId, external_url: externalUrl };
          continue;
        }

        if (ch === "facebook") {
          const fb = asRecord(fbRow);
          const pageId = String(fb["resource_id"] ?? "");
          const pageTokenRaw = String(fb["access_token_enc"] ?? "");
          const pageToken = tryDecryptToken(pageTokenRaw) || "";
          const fbMeta = asRecord(fb["meta"]);
          const fbExpired = isExpired(fb["expires_at"]) && !String(fbMeta["selected"] ?? "") && !pageId;
          if (String(fb["status"] ?? "") !== "connected" || !pageId || !pageToken || fbExpired) {
            await setDelivery(ch, { status: "failed", error: fbExpired ? "Facebook expiré : reconnectez le compte." : "Facebook non configuré (page/token manquant)" });
            results[ch] = { ok: false, error: "not_configured" };
            continue;
          }

          const resp = await facebookPublishToPage({
            pageId,
            pageAccessToken: pageToken,
            message: canonMessage,
            imageUrls: (getChannelImageSet(ch).socialFeedPublishableUrls.length ? getChannelImageSet(ch).socialFeedPublishableUrls : socialFeedImageUrls).slice(0, 5),
          });

          if (!resp.ok) {
            await setDelivery(ch, { status: "failed", error: resp.error });
            results[ch] = { ok: false, error: resp.error, diagnostics: resp };
            continue;
          }

          await setDelivery(ch, { status: "delivered", error: null });

          results[ch] = { ok: true, external_id: resp.postId, diagnostics: resp };
          continue;
        }

        if (ch === "instagram") {
          const ig = asRecord(igRow);
          const igUserId = String(ig["resource_id"] ?? "");
          const igTokenRaw = String(ig["access_token_enc"] ?? "");
          const igToken = tryDecryptToken(igTokenRaw) || "";
          const igMeta = asRecord(ig["meta"]);
          const igExpired = isExpired(ig["expires_at"]) && !String(igMeta["page_id"] ?? "") && !igUserId;
          if (String(ig["status"] ?? "") !== "connected" || !igUserId || !igToken || igExpired) {
            await setDelivery(ch, { status: "failed", error: igExpired ? "Instagram expiré : reconnectez le compte puis re-sélectionnez le profil Instagram." : "Instagram non configuré (compte/token manquant)" });
            results[ch] = { ok: false, error: "not_configured" };
            continue;
          }

          const instagramCaption = buildInstagramCaption(channelPost.title, channelPost.content, channelPost.cta, channelPost.hashtags);
          const instagramImages = (getChannelImageSet(ch).instagramPublishableUrls.length ? getChannelImageSet(ch).instagramPublishableUrls : instagramImageUrls).filter(Boolean).slice(0, 10);
          if (!instagramImages.length) {
            await setDelivery(ch, { status: "failed", error: "Instagram nécessite au moins 1 image" });
            results[ch] = { ok: false, error: "missing_image" };
            continue;
          }

          const resp = instagramImages.length > 1
            ? await instagramPublishCarousel({
                igUserId,
                accessToken: igToken,
                caption: instagramCaption,
                imageUrls: instagramImages,
              })
            : await instagramPublishPhoto({
                igUserId,
                accessToken: igToken,
                caption: instagramCaption,
                imageUrl: instagramImages[0],
              });

          if (!resp.ok) {
            await setDelivery(ch, { status: "failed", error: resp.error });
            results[ch] = { ok: false, error: resp.error, diagnostics: resp };
            continue;
          }

          await setDelivery(ch, { status: "delivered", error: null });

          results[ch] = { ok: true, external_id: resp.mediaId, diagnostics: resp };
          continue;
        }

        if (ch === "linkedin") {
          const li = asRecord(liRow);
          const accessTokenRaw = String(li["access_token_enc"] ?? "");
          const accessToken = tryDecryptToken(accessTokenRaw) || "";
          const authorUrn = String(li["resource_id"] ?? "");
          const liExpired = isExpired(li["expires_at"]);
          if (String(li["status"] ?? "") !== "connected" || !accessToken || !authorUrn || liExpired) {
            await setDelivery(ch, { status: "failed", error: liExpired ? "LinkedIn expiré : reconnectez le compte." : "LinkedIn non configuré (token/auteur manquant)" });
            results[ch] = { ok: false, error: "not_configured" };
            continue;
          }

          const liMeta = asRecord(li["meta"]);
          const orgUrn = String(liMeta["org_urn"] ?? "");
          const useAuthor = orgUrn || authorUrn;
          const linkedInImages = (getChannelImageSet(ch).socialFeedPublishableUrls.length ? getChannelImageSet(ch).socialFeedPublishableUrls : socialFeedImageUrls.length ? socialFeedImageUrls : externalImageUrls).filter(Boolean).slice(0, 20);
          let resp = linkedInImages.length > 1
            ? await linkedinPublishMultiImage({
                accessToken,
                authorUrn: useAuthor,
                text: canonMessage,
                imageUrls: linkedInImages,
                title: channelPost.title || undefined,
              })
            : linkedInImages[0]
              ? await linkedinPublishImage({
                  accessToken,
                  authorUrn: useAuthor,
                  text: canonMessage,
                  imageUrl: linkedInImages[0],
                  title: channelPost.title || undefined,
                })
              : await linkedinPublishText({
                  accessToken,
                  authorUrn: useAuthor,
                  text: canonMessage,
                });

          if (!resp.ok && linkedInImages[0]) {
            const fallbackResp = await linkedinPublishText({
              accessToken,
              authorUrn: useAuthor,
              text: canonMessage,
            });
            if (fallbackResp.ok) {
              resp = {
                ...fallbackResp,
                diagnostics: {
                  imagePublishError: resp.error,
                  imagePublishDiagnostics: resp.diagnostics,
                  fallback: "text_only",
                },
              };
            }
          }

          if (!resp.ok) {
            await setDelivery(ch, { status: "failed", error: resp.error });
            results[ch] = { ok: false, error: resp.error, diagnostics: resp };
            continue;
          }

          await setDelivery(ch, { status: "delivered", error: null });

          results[ch] = { ok: true, external_id: resp.postUrn || null, diagnostics: resp };
          continue;
        }

        if (ch === "gmb") {
          const gmb = asRecord(gmbRow);
          const locationName = String(gmb["resource_id"] ?? "");
          const gmbMeta = asRecord(gmb["meta"]);
          const accountName = String(gmbMeta["account"] ?? "");
          const gmbExpired = isExpired(gmb["expires_at"]);
          if (String(gmb["status"] ?? "") !== "connected" || !locationName || !accountName || gmbExpired) {
            await setDelivery(ch, { status: "failed", error: gmbExpired ? "Google Business expiré : reconnectez le compte." : "Google Business non configuré (compte/location manquant)" });
            results[ch] = { ok: false, error: "not_configured" };
            continue;
          }

          const tok = await getGmbToken();
          if (!tok?.accessToken) {
            await setDelivery(ch, { status: "failed", error: "Token Google invalide/expiré" });
            results[ch] = { ok: false, error: "token" };
            continue;
          }

          const gmbResp = await gmbCreateLocalPost({
            accessToken: tok.accessToken,
            accountName,
            locationName,
            summary: canonMessage.slice(0, 1498),
            imageUrls: (getChannelImageSet(ch).publishableUrls.length ? getChannelImageSet(ch).publishableUrls : externalImageUrls).slice(0, 5),
            languageCode: "fr-FR",
          });

          const gmbRespRec = asRecord(gmbResp);
          const externalId = String(gmbRespRec["name"] ?? "");
          await setDelivery(ch, { status: "delivered", error: null });
          results[ch] = { ok: true, external_id: externalId || null };
          continue;
        }

        results[ch] = { ok: false, error: "unsupported_channel" };
      } catch (e: unknown) {
        const msg = errMessage(e, "Erreur");
        await setDelivery(ch, { status: "failed", error: msg });
        results[ch] = { ok: false, error: msg };
      }
    }

    const persistedPostByChannel = Object.fromEntries(
      selected.map((channel) => {
        const baseValue = (postByChannel as Record<string, unknown>)[channel] as Record<string, unknown> | undefined;
        const imageSet = channelImageSets[channel];
        return [
          channel,
          imageSet
            ? {
                ...(baseValue || {}),
                images: imageSet.images,
                attachments: imageSet.images,
                publishableUrls: imageSet.publishableUrls,
                instagramPublishableUrls: imageSet.instagramPublishableUrls,
                socialFeedPublishableUrls: imageSet.socialFeedPublishableUrls,
                siteCardPublishableUrls: imageSet.siteCardPublishableUrls,
              }
            : (baseValue || {}),
        ];
      })
    );

    // 5) Log booster event
    await supabaseAdmin.from("app_events").insert({
      id: randomUUID(),
      user_id: userId,
      module: "booster",
      type: "publish",
      payload: {
        idea,
        channels: selected,
        post: firstPost,
        postByChannel: persistedPostByChannel,
        imageSettingsByChannel,
        images: uploadedUrls,
        publishableUrls,
        instagramPublishableUrls,
        socialFeedPublishableUrls,
        siteCardPublishableUrls,
        uploadErrors,
        publication_id: publicationId,
        results,
      },
    });

    return NextResponse.json({
      ok: true,
      publication_id: publicationId,
      images: uploadedUrls,
      publishableUrls,
      instagramPublishableUrls,
      socialFeedPublishableUrls,
      uploadErrors,
      results,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMessage(e, "Erreur") }, { status: 500 });
  }
}

