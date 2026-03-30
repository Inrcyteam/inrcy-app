const LINKEDIN_VERSION = "202603";

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

function linkedInHeaders(accessToken: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0",
    "Linkedin-Version": LINKEDIN_VERSION,
    ...extra,
  };
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

  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: linkedInHeaders(accessToken),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const { raw, json } = await parseResponse(res);

  if (!res.ok) {
    const errMsg = json?.message || json?.error || raw || "Impossible de publier sur LinkedIn pour le moment.";
    return { ok: false, error: errMsg, diagnostics: { status: res.status, body: json ?? raw, payload } };
  }

  const postUrn = res.headers.get("x-restli-id") || json?.id;
  return { ok: true, postUrn: postUrn || undefined, diagnostics: { status: res.status, body: json ?? raw } };
}

async function uploadLinkedInImage(params: {
  accessToken: string;
  ownerUrn: string;
  imageUrl: string;
}) {
  const { accessToken, ownerUrn, imageUrl } = params;

  const initRes = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: linkedInHeaders(accessToken),
    body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
    cache: "no-store",
  });

  const { raw: initRaw, json: initJson } = await parseResponse(initRes);
  if (!initRes.ok) {
    throw new Error(initJson?.message || initJson?.error || initRaw || "Impossible d’envoyer l’image sur LinkedIn pour le moment.");
  }

  const uploadUrl = String(initJson?.value?.uploadUrl || "");
  const imageUrn = String(initJson?.value?.image || "");
  if (!uploadUrl || !imageUrn) {
    throw new Error("LinkedIn n'a pas renvoyé les informations d'upload d'image.");
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
    throw new Error(uploadRaw || "Impossible d’envoyer l’image sur LinkedIn pour le moment.");
  }

  return { imageUrn, initJson: initJson ?? initRaw, uploadRaw };
}

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
        commentary: text,
        visibility,
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
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

    const uploaded = await uploadLinkedInImage({ accessToken, ownerUrn: authorUrn, imageUrl });
    const postResult = await createLinkedInPost({
      accessToken,
      payload: {
        author: authorUrn,
        commentary: text,
        visibility,
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content: {
          media: {
            altText: title || text.slice(0, 120),
            id: uploaded.imageUrn,
          },
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      },
    });

    if (!postResult.ok) {
      return {
        ...postResult,
        diagnostics: {
          stage: "post",
          imageUpload: uploaded,
          upstream: postResult.diagnostics,
        },
      };
    }

    return {
      ...postResult,
      diagnostics: {
        imageUpload: uploaded,
        upstream: postResult.diagnostics,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Impossible de publier l'image sur LinkedIn pour le moment." };
  }
}

export async function linkedinPublishMultiImage(params: {
  accessToken: string;
  authorUrn: string;
  text: string;
  imageUrls: string[];
  visibility?: "PUBLIC" | "CONNECTIONS";
  title?: string;
}): Promise<LinkedInPublishResult> {
  const { accessToken, authorUrn, text, visibility = "PUBLIC", title } = params;
  const imageUrls = (params.imageUrls || []).map((x) => String(x || "").trim()).filter(Boolean).slice(0, 20);

  try {
    if (!accessToken) return { ok: false, error: "Connexion LinkedIn invalide." };
    if (!authorUrn) return { ok: false, error: "Compte LinkedIn invalide." };
    if (!text?.trim()) return { ok: false, error: "Le contenu de la publication est vide." };
    if (imageUrls.length === 0) return linkedinPublishText({ accessToken, authorUrn, text, visibility });
    if (imageUrls.length === 1) return linkedinPublishImage({ accessToken, authorUrn, text, imageUrl: imageUrls[0], visibility, title });

    const uploadedImages = [] as Array<{ imageUrn: string; initJson: any; uploadRaw: string }>;
    for (const imageUrl of imageUrls) {
      uploadedImages.push(await uploadLinkedInImage({ accessToken, ownerUrn: authorUrn, imageUrl }));
    }

    const postResult = await createLinkedInPost({
      accessToken,
      payload: {
        author: authorUrn,
        commentary: text,
        visibility,
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content: {
          multiImage: {
            images: uploadedImages.map((img, index) => ({
              id: img.imageUrn,
              altText: index === 0 ? (title || text.slice(0, 120)) : `${title || "Publication iNrCy"} ${index + 1}`,
            })),
          },
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      },
    });

    if (!postResult.ok) {
      return {
        ...postResult,
        diagnostics: {
          stage: "multiImagePost",
          uploadedImages,
          upstream: postResult.diagnostics,
        },
      };
    }

    return {
      ...postResult,
      diagnostics: {
        uploadedImages,
        upstream: postResult.diagnostics,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Impossible de publier les images sur LinkedIn pour le moment." };
  }
}
