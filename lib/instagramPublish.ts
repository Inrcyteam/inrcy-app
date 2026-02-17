const FACEBOOK_GRAPH_VERSION = "v20.0";

type PublishOk = {
  ok: true;
  /** Published Instagram media id */
  mediaId: string;
  diagnostics?: {
    containerId?: string;
    createResponse?: any;
    publishResponse?: any;
  };
};

type PublishKo = {
  ok: false;
  error: string;
  diagnostics?: any;
};

export type InstagramPublishResult = PublishOk | PublishKo;

/**
 * Publish a single-photo post to an Instagram Business/Creator account using Instagram Graph API.
 *
 * Notes:
 * - `igUserId` is `instagram_business_account.id` tied to the selected Facebook Page.
 * - `imageUrl` must be reachable by Meta's servers (https, not localhost).
 * - Token must include: instagram_basic + instagram_content_publish (+ pages_show_list for discovery).
 */
export async function instagramPublishPhoto(params: {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrl: string;
}): Promise<InstagramPublishResult> {
  const { igUserId, accessToken, caption, imageUrl } = params;

  try {
    if (!igUserId) return { ok: false, error: "Missing igUserId" };
    if (!accessToken) return { ok: false, error: "Missing accessToken" };
    if (!imageUrl) return { ok: false, error: "Missing imageUrl" };

    // 1) Create a media container
    const createParams = new URLSearchParams({
      image_url: imageUrl,
      caption: caption || "",
      access_token: accessToken,
    });

    const createRes = await fetch(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${encodeURIComponent(igUserId)}/media?${createParams.toString()}`,
      { method: "POST", cache: "no-store" }
    );

    const createJson: any = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      return {
        ok: false,
        error: createJson?.error?.message || "Instagram media creation failed",
        diagnostics: createJson,
      };
    }

    const containerId = String(createJson?.id || "");
    if (!containerId) {
      return { ok: false, error: "Instagram media creation returned no id", diagnostics: createJson };
    }

    // 2) Publish the container
    const publishParams = new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken,
    });

    const publishRes = await fetch(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${encodeURIComponent(igUserId)}/media_publish?${publishParams.toString()}`,
      { method: "POST", cache: "no-store" }
    );

    const publishJson: any = await publishRes.json().catch(() => ({}));
    if (!publishRes.ok) {
      return {
        ok: false,
        error: publishJson?.error?.message || "Instagram publish failed",
        diagnostics: { containerId, publishJson },
      };
    }

    const mediaId = String(publishJson?.id || "");
    if (!mediaId) {
      return { ok: false, error: "Instagram publish returned no id", diagnostics: { containerId, publishJson } };
    }

    return {
      ok: true,
      mediaId,
      diagnostics: { containerId, createResponse: createJson, publishResponse: publishJson },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Unknown Instagram publish error" };
  }
}
