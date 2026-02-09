const FACEBOOK_GRAPH_VERSION = "v19.0";

type PublishResult = { ok: true; postId: string } | { ok: false; error: string };

/**
 * Upload one image to Facebook as an unpublished photo and return its media_fbid.
 * We prefer uploading via `source` (multipart) to avoid problems when the remote URL is not
 * publicly reachable from Meta's servers (e.g. blob: URLs, private storage, expiring URLs, etc.).
 */
async function uploadUnpublishedPhoto(params: {
  pageAccessToken: string;
  imageUrl: string;
}): Promise<{ ok: true; mediaFbid: string } | { ok: false; error: string }> {
  const { pageAccessToken, imageUrl } = params;

  try {
    let blob: Blob;

    // Support data URLs (base64)
    if (imageUrl.startsWith("data:")) {
      const m = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return { ok: false, error: "Invalid data URL for image" };
      const mime = m[1];
      const b64 = m[2];
      const buf = Buffer.from(b64, "base64");
      blob = new Blob([buf], { type: mime });
    } else {
      // Fetch the image server-side and upload bytes to Facebook
      const imgRes = await fetch(imageUrl, { cache: "no-store" });
      if (!imgRes.ok) {
        return { ok: false, error: `Failed to fetch image (${imgRes.status})` };
      }
      const contentType = imgRes.headers.get("content-type") || "application/octet-stream";
      const ab = await imgRes.arrayBuffer();
      blob = new Blob([ab], { type: contentType });
    }

    const form = new FormData();
    form.append("published", "false");
    form.append("access_token", pageAccessToken);
    // Facebook expects the binary in the field name `source`
    form.append("source", blob, "image");

    const uploadRes = await fetch(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/photos`,
      { method: "POST", body: form }
    );

    const uploadJson: any = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok) {
      return { ok: false, error: uploadJson?.error?.message || "Photo upload failed" };
    }

    const mediaFbid = uploadJson?.id;
    if (!mediaFbid) return { ok: false, error: "Photo upload succeeded but no id returned" };

    return { ok: true, mediaFbid };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Photo upload error" };
  }
}

export async function facebookPublishToPage(params: {
  pageAccessToken: string;
  message: string;
  imageUrls?: string[];
}): Promise<PublishResult> {
  const { pageAccessToken, message, imageUrls = [] } = params;

  try {
    const attachedMedia: any[] = [];

    for (const url of imageUrls) {
      const up = await uploadUnpublishedPhoto({ pageAccessToken, imageUrl: url });
      if (!up.ok) {
        // If one image fails, we continue with the rest instead of failing the whole post.
        // You can change this behavior depending on your UX needs.
        console.warn("[facebookPublish] image upload failed:", up.error);
        continue;
      }
      attachedMedia.push({ media_fbid: up.mediaFbid });
    }

    const feedForm = new FormData();
    feedForm.append("message", message);
    feedForm.append("access_token", pageAccessToken);

    // Attach uploaded photos (if any)
    attachedMedia.forEach((m, i) => {
      feedForm.append(`attached_media[${i}]`, JSON.stringify(m));
    });

    const feedRes = await fetch(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/feed`,
      { method: "POST", body: feedForm }
    );

    const feedJson: any = await feedRes.json().catch(() => ({}));
    if (!feedRes.ok) {
      return { ok: false, error: feedJson?.error?.message || "Facebook feed post failed" };
    }

    return { ok: true, postId: feedJson.id };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Unknown Facebook publish error" };
  }
}
