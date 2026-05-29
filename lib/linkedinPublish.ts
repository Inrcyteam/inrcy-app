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

type LinkedInVideoUploadInstruction = {
  uploadUrl: string;
  firstByte: number;
  lastByte: number;
};

type LinkedInVideoStatus =
  | "WAITING_UPLOAD"
  | "PROCESSING"
  | "PROCESSING_FAILED"
  | "AVAILABLE"
  | string;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isLinkedInMp4Video(blob: Blob, sourceUrl: string) {
  const mime = String(blob.type || "").toLowerCase();
  const urlWithoutQuery = String(sourceUrl || "").split("?")[0].toLowerCase();
  return mime.includes("mp4") || urlWithoutQuery.endsWith(".mp4");
}

async function getLinkedInVideoStatus(params: {
  accessToken: string;
  videoUrn: string;
}) {
  const { accessToken, videoUrn } = params;
  const res = await fetch(
    `https://api.linkedin.com/rest/videos/${encodeURIComponent(videoUrn)}`,
    {
      method: "GET",
      headers: linkedInHeaders(accessToken),
      cache: "no-store",
    },
  );

  const { raw, json } = await parseResponse(res);
  if (!res.ok) {
    throw new Error(
      json?.message ||
        json?.error ||
        raw ||
        "Impossible de vérifier le statut de la vidéo LinkedIn.",
    );
  }

  const status = String(json?.status || "") as LinkedInVideoStatus;
  return { status, body: json ?? raw };
}

async function waitForLinkedInVideoAfterFinalize(params: {
  accessToken: string;
  videoUrn: string;
}) {
  const { accessToken, videoUrn } = params;
  const delays = [900, 1400, 2200, 3200, 4600, 6200, 8000];
  let lastStatus = "";
  let lastBody: any = null;

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    const checked = await getLinkedInVideoStatus({ accessToken, videoUrn });
    lastStatus = checked.status;
    lastBody = checked.body;

    if (lastStatus === "PROCESSING_FAILED") {
      const reason = String(checked.body?.processingFailureReason || "").trim();
      throw new Error(
        reason
          ? `LinkedIn a refusé le traitement vidéo : ${reason}`
          : "LinkedIn a refusé le traitement vidéo.",
      );
    }

    if (lastStatus === "AVAILABLE") {
      return { status: lastStatus, body: lastBody, readyForPost: true };
    }

    // Après finalize, LinkedIn peut rester quelques secondes en PROCESSING.
    // Le post est tenté après une courte attente, mais jamais en WAITING_UPLOAD.
    if (lastStatus === "PROCESSING" && attempt >= 2) {
      return { status: lastStatus, body: lastBody, readyForPost: true };
    }

    await wait(delays[attempt]);
  }

  if (lastStatus === "PROCESSING") {
    return { status: lastStatus, body: lastBody, readyForPost: true };
  }

  throw new Error(
    lastStatus === "WAITING_UPLOAD"
      ? "LinkedIn attend encore la finalisation de l'upload vidéo."
      : "LinkedIn n'a pas confirmé la disponibilité de la vidéo.",
  );
}


async function fetchVideoBlob(videoUrl: string): Promise<Blob> {
  if (videoUrl.startsWith("data:")) {
    const m = videoUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error("Vidéo LinkedIn invalide.");
    return new Blob([Buffer.from(m[2] || "", "base64")], { type: m[1] || "video/mp4" });
  }

  const videoRes = await fetch(videoUrl, { cache: "no-store" });
  if (!videoRes.ok) {
    throw new Error(`Impossible de récupérer la vidéo LinkedIn (${videoRes.status}).`);
  }
  const ab = await videoRes.arrayBuffer();
  const mime = videoRes.headers.get("content-type") || "video/mp4";
  return new Blob([ab], { type: mime });
}

function normalizeLinkedInUploadInstructions(value: any, fallbackUploadUrl: string, fileSize: number): LinkedInVideoUploadInstruction[] {
  const rawInstructions = Array.isArray(value?.uploadInstructions) ? value.uploadInstructions : [];
  const instructions = rawInstructions
    .map((item: any): LinkedInVideoUploadInstruction | null => {
      const uploadUrl = String(item?.uploadUrl || "").trim();
      const firstByte = Number(item?.firstByte ?? 0);
      const lastByte = Number(item?.lastByte ?? fileSize - 1);
      if (!uploadUrl || !Number.isFinite(firstByte) || !Number.isFinite(lastByte)) return null;
      return { uploadUrl, firstByte: Math.max(0, firstByte), lastByte: Math.min(fileSize - 1, lastByte) };
    })
    .filter(Boolean) as LinkedInVideoUploadInstruction[];

  if (instructions.length) return instructions;
  if (fallbackUploadUrl) return [{ uploadUrl: fallbackUploadUrl, firstByte: 0, lastByte: fileSize - 1 }];
  return [];
}

async function uploadLinkedInVideo(params: {
  accessToken: string;
  ownerUrn: string;
  videoUrl: string;
}) {
  const { accessToken, ownerUrn, videoUrl } = params;
  const videoBlob = await fetchVideoBlob(videoUrl);
  if (!isLinkedInMp4Video(videoBlob, videoUrl)) {
    throw new Error("LinkedIn accepte uniquement les vidéos MP4 pour ce type de publication.");
  }

  const videoBuffer = await videoBlob.arrayBuffer();
  const fileSizeBytes = videoBlob.size || videoBuffer.byteLength;

  const initRes = await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
    method: "POST",
    headers: linkedInHeaders(accessToken),
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: ownerUrn,
        fileSizeBytes,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    }),
    cache: "no-store",
  });

  const { raw: initRaw, json: initJson } = await parseResponse(initRes);
  if (!initRes.ok) {
    throw new Error(initJson?.message || initJson?.error || initRaw || "Impossible de préparer la vidéo LinkedIn.");
  }

  const value = initJson?.value || {};
  const videoUrn = String(value?.video || "");
  const uploadToken = String(value?.uploadToken || "");
  const uploadUrl = String(value?.uploadUrl || "");
  const instructions = normalizeLinkedInUploadInstructions(value, uploadUrl, fileSizeBytes);

  if (!videoUrn || !instructions.length) {
    throw new Error("LinkedIn n'a pas renvoyé les informations d'upload vidéo.");
  }

  const uploadedPartIds: string[] = [];
  const uploadResponses: any[] = [];

  for (const instruction of instructions) {
    const part = videoBuffer.slice(instruction.firstByte, instruction.lastByte + 1);
    const uploadRes = await fetch(instruction.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: part,
      cache: "no-store",
    });

    const uploadRaw = await uploadRes.text().catch(() => "");
    const etag = String(uploadRes.headers.get("etag") || "").replace(/^\"|\"$/g, "");
    uploadResponses.push({ status: uploadRes.status, etag, raw: uploadRaw, firstByte: instruction.firstByte, lastByte: instruction.lastByte });

    if (!uploadRes.ok) {
      throw new Error(uploadRaw || "Impossible d’envoyer la vidéo sur LinkedIn.");
    }
    if (etag) uploadedPartIds.push(etag);
  }

  if (uploadedPartIds.length !== instructions.length) {
    throw new Error("LinkedIn n'a pas renvoyé tous les identifiants d'upload vidéo.");
  }

  const finalizeRes = await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
    method: "POST",
    headers: linkedInHeaders(accessToken),
    body: JSON.stringify({
      finalizeUploadRequest: {
        video: videoUrn,
        uploadToken,
        uploadedPartIds,
      },
    }),
    cache: "no-store",
  });
  const { raw: finalizeRaw, json } = await parseResponse(finalizeRes);
  const finalizeJson = json ?? finalizeRaw;
  if (!finalizeRes.ok) {
    throw new Error(json?.message || json?.error || finalizeRaw || "Impossible de finaliser la vidéo LinkedIn.");
  }

  const videoStatus = await waitForLinkedInVideoAfterFinalize({
    accessToken,
    videoUrn,
  });

  return {
    videoUrn,
    initJson: initJson ?? initRaw,
    uploadResponses,
    finalizeJson,
    videoStatus,
  };
}

export async function linkedinPublishVideo(params: {
  accessToken: string;
  authorUrn: string;
  text: string;
  videoUrl: string;
  visibility?: "PUBLIC" | "CONNECTIONS";
  title?: string;
}): Promise<LinkedInPublishResult> {
  const { accessToken, authorUrn, text, videoUrl, visibility = "PUBLIC", title } = params;

  try {
    if (!accessToken) return { ok: false, error: "Connexion LinkedIn invalide." };
    if (!authorUrn) return { ok: false, error: "Compte LinkedIn invalide." };
    if (!text?.trim()) return { ok: false, error: "Le contenu de la publication est vide." };
    if (!videoUrl?.trim()) return linkedinPublishText({ accessToken, authorUrn, text, visibility });

    const uploaded = await uploadLinkedInVideo({ accessToken, ownerUrn: authorUrn, videoUrl });
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
            id: uploaded.videoUrn,
            title: title || undefined,
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
          stage: "videoPost",
          videoUpload: uploaded,
          upstream: postResult.diagnostics,
        },
      };
    }

    return {
      ...postResult,
      diagnostics: {
        videoUpload: uploaded,
        upstream: postResult.diagnostics,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Impossible de publier la vidéo sur LinkedIn pour le moment." };
  }
}
