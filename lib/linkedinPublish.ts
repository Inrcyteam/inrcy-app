type PublishOk = {
  ok: true;
  /** LinkedIn post URN (often returned in x-restli-id header). */
  postUrn?: string;
  diagnostics?: any;
};

type PublishKo = {
  ok: false;
  error: string;
  diagnostics?: any;
};

export type LinkedInPublishResult = PublishOk | PublishKo;

async function parseResponse(res: Response) {
  const raw = await res.text().catch(() => "");
  let json: any = null;
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
  }
  return { raw, json };
}

async function fetchImageBlob(imageUrl: string): Promise<Blob> {
  if (imageUrl.startsWith("data:")) {
    const m = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error("Image LinkedIn invalide.");
    const mime = m[1] || "image/jpeg";
    const b64 = m[2] || "";
    const buf = Buffer.from(b64, "base64");
    return new Blob([buf], { type: mime });
  }

  const imgRes = await fetch(imageUrl, { cache: "no-store" });
  if (!imgRes.ok) {
    throw new Error(`Impossible de récupérer l'image LinkedIn (${imgRes.status}).`);
  }
  const ab = await imgRes.arrayBuffer();
  const mime = imgRes.headers.get("content-type") || "image/jpeg";
  return new Blob([ab], { type: mime });
}

async function createLinkedInPost(params: {
  accessToken: string;
  payload: Record<string, unknown>;
}): Promise<LinkedInPublishResult> {
  const { accessToken, payload } = params;

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const { raw, json } = await parseResponse(res);

  if (!res.ok) {
    const errMsg = json?.message || json?.error || raw || `LinkedIn publish failed (${res.status})`;
    return { ok: false, error: errMsg, diagnostics: { status: res.status, body: json ?? raw } };
  }

  const postUrn = res.headers.get("x-restli-id") || json?.id;
  return { ok: true, postUrn: postUrn || undefined, diagnostics: { status: res.status, body: json ?? raw } };
}

/**
 * Publish a text-only LinkedIn post using the UGC API.
 *
 * authorUrn examples:
 * - Person: urn:li:person:xxxxx
 * - Org:    urn:li:organization:xxxxx
 */
export async function linkedinPublishText(params: {
  accessToken: string;
  authorUrn: string;
  text: string;
  visibility?: "PUBLIC" | "CONNECTIONS";
}): Promise<LinkedInPublishResult> {
  const { accessToken, authorUrn, text, visibility = "PUBLIC" } = params;

  try {
    if (!accessToken) return { ok: false, error: "Connexion LinkedIn invalide." };
    if (!authorUrn) return { ok: false, error: "Compte LinkedIn invalide." };
    if (!text?.trim()) return { ok: false, error: "Le contenu de la publication est vide." };

    return await createLinkedInPost({
      accessToken,
      payload: {
        author: authorUrn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text },
            shareMediaCategory: "NONE",
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": visibility,
        },
      },
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || "Impossible de publier sur LinkedIn pour le moment." };
  }
}

export async function linkedinPublishImage(params: {
  accessToken: string;
  authorUrn: string;
  text: string;
  imageUrl: string;
  visibility?: "PUBLIC" | "CONNECTIONS";
  title?: string;
}): Promise<LinkedInPublishResult> {
  const { accessToken, authorUrn, text, imageUrl, visibility = "PUBLIC", title } = params;

  try {
    if (!accessToken) return { ok: false, error: "Connexion LinkedIn invalide." };
    if (!authorUrn) return { ok: false, error: "Compte LinkedIn invalide." };
    if (!text?.trim()) return { ok: false, error: "Le contenu de la publication est vide." };
    if (!imageUrl?.trim()) return linkedinPublishText({ accessToken, authorUrn, text, visibility });

    const registerRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          owner: authorUrn,
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
      cache: "no-store",
    });

    const { raw: registerRaw, json: registerJson } = await parseResponse(registerRes);
    if (!registerRes.ok) {
      const errMsg = registerJson?.message || registerJson?.error || registerRaw || `LinkedIn registerUpload failed (${registerRes.status})`;
      return { ok: false, error: errMsg, diagnostics: { stage: "registerUpload", status: registerRes.status, body: registerJson ?? registerRaw } };
    }

    const uploadInfo = registerJson?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"];
    const uploadUrl = String(uploadInfo?.uploadUrl || "");
    const asset = String(registerJson?.value?.asset || "");
    if (!uploadUrl || !asset) {
      return { ok: false, error: "LinkedIn n'a pas renvoyé les informations d'upload du média.", diagnostics: { stage: "registerUpload", body: registerJson ?? registerRaw } };
    }

    const imageBlob = await fetchImageBlob(imageUrl);
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": imageBlob.type || "image/jpeg",
      },
      body: imageBlob,
      cache: "no-store",
    });

    const uploadRaw = await uploadRes.text().catch(() => "");
    if (!uploadRes.ok) {
      return { ok: false, error: uploadRaw || `LinkedIn media upload failed (${uploadRes.status})`, diagnostics: { stage: "upload", status: uploadRes.status, body: uploadRaw } };
    }

    const postResult = await createLinkedInPost({
      accessToken,
      payload: {
        author: authorUrn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text },
            shareMediaCategory: "IMAGE",
            media: [
              {
                status: "READY",
                description: { text: title || text.slice(0, 200) },
                media: asset,
                title: { text: title || "Publication iNrCy" },
              },
            ],
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": visibility,
        },
      },
    });

    if (!postResult.ok) {
      return {
        ...postResult,
        diagnostics: {
          stage: "ugcPost",
          registerUpload: registerJson ?? registerRaw,
          asset,
          upstream: postResult.diagnostics,
        },
      };
    }

    return {
      ...postResult,
      diagnostics: {
        registerUpload: registerJson ?? registerRaw,
        asset,
        upstream: postResult.diagnostics,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Impossible de publier l'image sur LinkedIn pour le moment." };
  }
}
