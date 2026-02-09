import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { createSupabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { facebookPublishToPage } from "@/lib/facebookPublish";
import { getGmbToken, gmbCreateLocalPost } from "@/lib/googleBusiness";

type ChannelKey = "inrcy_site" | "site_web" | "gmb" | "facebook";

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

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = userData.user.id;

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
      ? post.hashtags.map((h) => String(h || "").trim()).filter(Boolean).slice(0, 6)
      : [];

    if (!content) {
      return NextResponse.json({ error: "Le contenu est vide." }, { status: 400 });
    }

    // 1) Upload images (optional) to Supabase Storage (bucket: booster)
    // Note: for external platforms (Facebook/Google), the image URL must be fetchable
    // by their servers. If your Supabase bucket is not public, getPublicUrl() will
    // produce a URL that returns 403 for unauthenticated requests, so the post will
    // be created without photos. To keep the UI stable (store publicUrl in DB when
    // available) while ensuring publish works, we also generate signed URLs and use
    // them for publishing.
    const uploadedUrls: string[] = []; // persisted in DB (for UI)
    const publishableUrls: string[] = []; // used for Facebook/Google publish
    for (const img of images.slice(0, 5)) {
      const parsed = dataUrlToBuffer(img.dataUrl);
      if (!parsed) continue;

      const ext = (img.name || "image").split(".").pop() || "jpg";
      const path = `${userId}/${randomUUID()}.${ext}`;

      const up = await supabaseAdmin.storage
        .from("booster")
        .upload(path, parsed.buffer, {
          contentType: parsed.mime || img.type || "application/octet-stream",
          upsert: false,
        });

      if (!up.error) {
        // 1) Public URL (works only if bucket is public)
        const pub = supabaseAdmin.storage.from("booster").getPublicUrl(path);
        if (pub?.data?.publicUrl) uploadedUrls.push(pub.data.publicUrl);

        // 2) Signed URL (works even if bucket is private)
        // Give enough time for Meta/Google to fetch the asset.
        const signed = await supabaseAdmin.storage.from("booster").createSignedUrl(path, 60 * 60 * 24);
        if (signed?.data?.signedUrl) {
          publishableUrls.push(signed.data.signedUrl);
        } else if (pub?.data?.publicUrl) {
          // Fallback
          publishableUrls.push(pub.data.publicUrl);
        }
      }
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
      return NextResponse.json({ error: pubErr.message }, { status: 500 });
    }

    // 3) Create deliveries (one row per channel)
    const deliveries = selected.map((ch) => ({
      id: randomUUID(),
      publication_id: publicationId,
      user_id: userId,
      channel: ch,
      status: "queued" as const,
    }));

    await supabaseAdmin.from("publication_deliveries").insert(deliveries);

    // 4) Try to publish NOW for channels that are truly connected + configured.
    const results: Record<string, any> = {};

    // Load integration rows once
    const { data: fbRow } = await supabaseAdmin
      .from("stats_integrations")
      .select("status,resource_id,access_token_enc")
      .eq("user_id", userId)
      .eq("provider", "facebook")
      .eq("source", "facebook")
      .eq("product", "facebook")
      .maybeSingle();

    const { data: gmbRow } = await supabaseAdmin
      .from("stats_integrations")
      .select("status,resource_id,meta")
      .eq("user_id", userId)
      .eq("provider", "google")
      .eq("source", "gmb")
      .eq("product", "gmb")
      .maybeSingle();

    const canonMessage = buildCanonMessage(title, content, cta);
    const externalImageUrls = (publishableUrls.length ? publishableUrls : uploadedUrls).slice(0, 5);

    // Helper: update delivery row
    async function setDelivery(channel: ChannelKey, patch: any) {
      await supabaseAdmin
        .from("publication_deliveries")
        .update(patch)
        .eq("publication_id", publicationId)
        .eq("user_id", userId)
        .eq("channel", channel);
    }

    for (const ch of selected) {
      try {
        if (ch === "inrcy_site" || ch === "site_web") {
          // Internal: publication is already persisted -> consider it delivered.
          await setDelivery(ch, { status: "delivered", delivered_at: new Date().toISOString() });
          results[ch] = { ok: true };
          continue;
        }

        if (ch === "facebook") {
          const pageId = String((fbRow as any)?.resource_id || "");
          const pageToken = String((fbRow as any)?.access_token_enc || "");
          if ((fbRow as any)?.status !== "connected" || !pageId || !pageToken) {
            await setDelivery(ch, { status: "failed", last_error: "Facebook non configuré (page/token manquant)" });
            results[ch] = { ok: false, error: "not_configured" };
            continue;
          }

         const resp = await facebookPublishToPage({
  pageAccessToken: pageToken,
  message: canonMessage,
  imageUrls: externalImageUrls,
});

          await setDelivery(ch, {
            status: "delivered",
            delivered_at: new Date().toISOString(),
            external_id: (resp.ok ? resp.postId : null),
          });
          results[ch] = { ok: true, external_id: (resp.ok ? resp.postId : null) };
          continue;
        }

        if (ch === "gmb") {
          const locationName = String((gmbRow as any)?.resource_id || "");
          const accountName = String((gmbRow as any)?.meta?.account || "");
          if ((gmbRow as any)?.status !== "connected" || !locationName || !accountName) {
            await setDelivery(ch, { status: "failed", last_error: "Google Business non configuré (compte/location manquant)" });
            results[ch] = { ok: false, error: "not_configured" };
            continue;
          }

          const tok = await getGmbToken();
          if (!tok?.accessToken) {
            await setDelivery(ch, { status: "failed", last_error: "Token Google invalide/expiré" });
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

          const externalId = String((gmbResp as any)?.name || "");
          await setDelivery(ch, {
            status: "delivered",
            delivered_at: new Date().toISOString(),
            external_id: externalId || null,
          });
          results[ch] = { ok: true, external_id: externalId || null };
          continue;
        }

        // Fallback
        results[ch] = { ok: false, error: "unsupported_channel" };
      } catch (e: any) {
        await setDelivery(ch, { status: "failed", last_error: e?.message || "Erreur" });
        results[ch] = { ok: false, error: e?.message || "Erreur" };
      }
    }

    // 5) Log booster event (metrics)
    await supabaseAdmin.from("booster_events").insert({
      id: randomUUID(),
      user_id: userId,
      type: "publish",
      payload: {
        idea,
        channels: selected,
        post: { title, content, cta, hashtags },
        images: uploadedUrls,
        publication_id: publicationId,
        results,
      },
    });

    return NextResponse.json({ ok: true, publication_id: publicationId, images: uploadedUrls, results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}