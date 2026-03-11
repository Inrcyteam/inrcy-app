import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { enforceRateLimit } from "@/lib/rateLimit";
import { tryDecryptToken } from "@/lib/oauthCrypto";
import { randomUUID } from "crypto";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { facebookPublishToPage } from "@/lib/facebookPublish";
import { instagramPublishPhoto } from "@/lib/instagramPublish";
import { linkedinPublishText } from "@/lib/linkedinPublish";
import { getGmbToken, gmbCreateLocalPost } from "@/lib/googleBusiness";
import { optimizeForInstagram } from "@/lib/imageOptimizer";

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
    const idea = String(body.idea || "").trim();
    const images = (Array.isArray(body.images) ? body.images : []) as ImagePayload[];

    const selected = Array.from(new Set(channels)).filter(Boolean);
    if (!selected.length) {
      return NextResponse.json({ error: "Sélectionnez au moins 1 canal." }, { status: 400 });
    }

    const title = String(post.title || "").trim();
    const content = String(post.content || "").trim();
    const cta = String(post.cta || "").trim();
    const hashtags = Array.isArray(post.hashtags)
      ? post.hashtags.map((h) => normalizeHashtag(String(h || ""))).filter(Boolean).slice(0, 20)
      : [];

    if (!content) {
      return NextResponse.json({ error: "Le contenu est vide." }, { status: 400 });
    }

    // 1) Upload images to Supabase Storage (bucket: booster) + collect diagnostics
    const uploadedUrls: string[] = []; // stored for UI
    const publishableUrls: string[] = []; // used for external platforms
    const instagramPublishableUrls: string[] = []; // optimized JPEGs for Instagram
    const uploadErrors: Array<{
      name: string;
      reason: string;
      stage: "parse" | "upload" | "publicUrl" | "signedUrl" | "instagramOptimize" | "instagramUpload";
    }> = [];

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
      title,
      content,
      cta,
      hashtags,
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

    const canonMessage = buildCanonMessage(title, content, cta);
    const externalImageUrls = (publishableUrls.length ? publishableUrls : uploadedUrls).slice(0, 5);
    const instagramImageUrls = (instagramPublishableUrls.length ? instagramPublishableUrls : externalImageUrls).slice(0, 5);

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
          const slug = slugify(title) || "actu";
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
            title,
            content,
            cta,
            hashtags,
            images: uploadedUrls,          // ✅ les URLs publiques des images
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
            imageUrls: externalImageUrls,
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

          const img = instagramImageUrls[0];
          if (!img) {
            await setDelivery(ch, { status: "failed", error: "Instagram nécessite au moins 1 image" });
            results[ch] = { ok: false, error: "missing_image" };
            continue;
          }

          const instagramCaption = buildInstagramCaption(title, content, cta, hashtags);

          const resp = await instagramPublishPhoto({
            igUserId,
            accessToken: igToken,
            caption: instagramCaption,
            imageUrl: img,
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
          const resp = await linkedinPublishText({
            accessToken,
            authorUrn: useAuthor,
            text: canonMessage,
          });

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
            imageUrls: externalImageUrls,
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

    // 5) Log booster event
    await supabaseAdmin.from("app_events").insert({
      id: randomUUID(),
      user_id: userId,
      module: "booster",
      type: "publish",
      payload: {
        idea,
        channels: selected,
        post: { title, content, cta, hashtags },
        images: uploadedUrls,
        publishableUrls,
        instagramPublishableUrls,
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
      uploadErrors,
      results,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMessage(e, "Erreur") }, { status: 500 });
  }
}