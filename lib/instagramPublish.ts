const FACEBOOK_GRAPH_VERSION = "v20.0";

type PublishOk = {
  ok: true;
  /** Published Instagram media id */
  mediaId: string;
  diagnostics?: {
    containerId?: string;
    childContainerIds?: string[];
    createResponse?: any;
    childCreateResponses?: any[];
    statusChecks?: any[];
    childStatusChecks?: Array<{ containerId: string; checks: any[] }>;
    publishResponse?: any;
  };
};

type PublishKo = {
  ok: false;
  error: string;
  diagnostics?: any;
};

export type InstagramPublishResult = PublishOk | PublishKo;

type WaitForContainerReadyResult =
  | { ok: true; checks: any[] }
  | { ok: false; error: string; checks: any[] };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function waitForContainerReady(params: {
  containerId: string;
  accessToken: string;
  maxAttempts?: number;
  initialDelayMs?: number;
}): Promise<WaitForContainerReadyResult> {
  const {
    containerId,
    accessToken,
    maxAttempts = 10,
    initialDelayMs = 1500,
  } = params;

  const checks: any[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await sleep(attempt === 1 ? initialDelayMs : initialDelayMs * attempt);

    const qs = new URLSearchParams({
      fields: "status,status_code",
      access_token: accessToken,
    });

    const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${encodeURIComponent(containerId)}?${qs.toString()}`;
    const { res, json } = await fetchJson(url, { method: "GET" });

    const row = {
      attempt,
      ok: res.ok,
      httpStatus: res.status,
      status: json?.status ?? null,
      status_code: json?.status_code ?? null,
      raw: json,
    };
    checks.push(row);

    if (!res.ok) {
      return {
        ok: false,
        error: json?.error?.message || "Impossible de vérifier le statut du container Instagram",
        checks,
      };
    }

    const statusCode = String(json?.status_code || "").toUpperCase();
    const status = String(json?.status || "").toUpperCase();

    if (statusCode === "FINISHED" || status === "FINISHED") {
      return { ok: true, checks };
    }

    if (statusCode === "ERROR" || status === "ERROR" || json?.error) {
      return {
        ok: false,
        error: json?.error?.message || "Le container Instagram est en erreur",
        checks,
      };
    }
  }

  return {
    ok: false,
    error: "Instagram met trop de temps à répondre. Merci de réessayer.",
    checks,
  };
}

async function createInstagramImageContainer(params: {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption?: string;
  isCarouselItem?: boolean;
}) {
  const createParams = new URLSearchParams({
    image_url: params.imageUrl,
    access_token: params.accessToken,
  });

  if (params.caption) createParams.set("caption", params.caption);
  if (params.isCarouselItem) createParams.set("is_carousel_item", "true");

  const createUrl = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${encodeURIComponent(params.igUserId)}/media?${createParams.toString()}`;
  return fetchJson(createUrl, { method: "POST" });
}

async function publishInstagramContainer(params: {
  igUserId: string;
  accessToken: string;
  creationId: string;
}) {
  const publishParams = new URLSearchParams({
    creation_id: params.creationId,
    access_token: params.accessToken,
  });

  const publishUrl = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${encodeURIComponent(params.igUserId)}/media_publish?${publishParams.toString()}`;
  return fetchJson(publishUrl, { method: "POST" });
}

/**
 * Publish a single-photo post to an Instagram Business/Creator account using Instagram Graph API.
 */
export async function instagramPublishPhoto(params: {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrl: string;
}): Promise<InstagramPublishResult> {
  const { igUserId, accessToken, caption, imageUrl } = params;

  try {
    if (!igUserId) return { ok: false, error: "Certaines informations nécessaires à la publication Instagram sont manquantes." };
    if (!accessToken) return { ok: false, error: "La connexion Instagram a expiré. Merci de reconnecter votre compte." };
    if (!imageUrl) return { ok: false, error: "Ajoute au moins une image pour publier sur Instagram." };

    const { res: createRes, json: createJson } = await createInstagramImageContainer({
      igUserId,
      accessToken,
      caption,
      imageUrl,
    });

    if (!createRes.ok) {
      return {
        ok: false,
        error: createJson?.error?.message || "Impossible de préparer la publication Instagram.",
        diagnostics: { createResponse: createJson },
      };
    }

    const containerId = String(createJson?.id || "");
    if (!containerId) {
      return {
        ok: false,
        error: "Instagram media creation returned no id",
        diagnostics: { createResponse: createJson },
      };
    }

    const waitResult = await waitForContainerReady({
      containerId,
      accessToken,
      maxAttempts: 10,
      initialDelayMs: 1200,
    });

    if (!waitResult.ok) {
      return {
        ok: false,
        error: waitResult.error,
        diagnostics: {
          containerId,
          createResponse: createJson,
          statusChecks: waitResult.checks,
        },
      };
    }

    const { res: publishRes, json: publishJson } = await publishInstagramContainer({
      igUserId,
      accessToken,
      creationId: containerId,
    });

    if (!publishRes.ok) {
      return {
        ok: false,
        error: publishJson?.error?.message || "Impossible de publier sur Instagram pour le moment.",
        diagnostics: {
          containerId,
          createResponse: createJson,
          statusChecks: waitResult.checks,
          publishResponse: publishJson,
        },
      };
    }

    const mediaId = String(publishJson?.id || "");
    if (!mediaId) {
      return {
        ok: false,
        error: "La publication Instagram n’a pas pu être finalisée.",
        diagnostics: {
          containerId,
          createResponse: createJson,
          statusChecks: waitResult.checks,
          publishResponse: publishJson,
        },
      };
    }

    return {
      ok: true,
      mediaId,
      diagnostics: {
        containerId,
        createResponse: createJson,
        statusChecks: waitResult.checks,
        publishResponse: publishJson,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Une erreur est survenue lors de la publication Instagram." };
  }
}

export async function instagramPublishCarousel(params: {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrls: string[];
}): Promise<InstagramPublishResult> {
  const { igUserId, accessToken, caption } = params;
  const imageUrls = (params.imageUrls || []).map((x) => String(x || "").trim()).filter(Boolean).slice(0, 10);

  try {
    if (!igUserId) return { ok: false, error: "Certaines informations nécessaires à la publication Instagram sont manquantes." };
    if (!accessToken) return { ok: false, error: "La connexion Instagram a expiré. Merci de reconnecter votre compte." };
    if (imageUrls.length === 0) return { ok: false, error: "Ajoute au moins une image pour publier sur Instagram." };
    if (imageUrls.length === 1) {
      return instagramPublishPhoto({ igUserId, accessToken, caption, imageUrl: imageUrls[0] });
    }

    const childContainerIds: string[] = [];
    const childCreateResponses: any[] = [];
    const childStatusChecks: Array<{ containerId: string; checks: any[] }> = [];

    for (const imageUrl of imageUrls) {
      const { res: childRes, json: childJson } = await createInstagramImageContainer({
        igUserId,
        accessToken,
        imageUrl,
        isCarouselItem: true,
      });

      childCreateResponses.push(childJson);

      if (!childRes.ok) {
        return {
          ok: false,
          error: childJson?.error?.message || "Impossible de préparer le carrousel Instagram.",
          diagnostics: { childCreateResponses },
        };
      }

      const childId = String(childJson?.id || "");
      if (!childId) {
        return {
          ok: false,
          error: "Instagram carousel child creation returned no id",
          diagnostics: { childCreateResponses },
        };
      }

      childContainerIds.push(childId);
    }

    for (const containerId of childContainerIds) {
      const waitResult = await waitForContainerReady({
        containerId,
        accessToken,
        maxAttempts: 10,
        initialDelayMs: 1200,
      });

      childStatusChecks.push({ containerId, checks: waitResult.checks });
      if (!waitResult.ok) {
        return {
          ok: false,
          error: waitResult.error,
          diagnostics: { childContainerIds, childCreateResponses, childStatusChecks },
        };
      }
    }

    const createParams = new URLSearchParams({
      media_type: "CAROUSEL",
      children: childContainerIds.join(","),
      caption: caption || "",
      access_token: accessToken,
    });

    const createUrl = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${encodeURIComponent(igUserId)}/media?${createParams.toString()}`;
    const { res: createRes, json: createJson } = await fetchJson(createUrl, { method: "POST" });

    if (!createRes.ok) {
      return {
        ok: false,
        error: createJson?.error?.message || "Impossible de créer le carrousel Instagram.",
        diagnostics: { childContainerIds, childCreateResponses, childStatusChecks, createResponse: createJson },
      };
    }

    const containerId = String(createJson?.id || "");
    if (!containerId) {
      return {
        ok: false,
        error: "Instagram carousel creation returned no id",
        diagnostics: { childContainerIds, childCreateResponses, childStatusChecks, createResponse: createJson },
      };
    }

    const waitResult = await waitForContainerReady({
      containerId,
      accessToken,
      maxAttempts: 10,
      initialDelayMs: 1200,
    });

    if (!waitResult.ok) {
      return {
        ok: false,
        error: waitResult.error,
        diagnostics: {
          containerId,
          childContainerIds,
          childCreateResponses,
          childStatusChecks,
          createResponse: createJson,
          statusChecks: waitResult.checks,
        },
      };
    }

    const { res: publishRes, json: publishJson } = await publishInstagramContainer({
      igUserId,
      accessToken,
      creationId: containerId,
    });

    if (!publishRes.ok) {
      return {
        ok: false,
        error: publishJson?.error?.message || "Impossible de publier le carrousel Instagram pour le moment.",
        diagnostics: {
          containerId,
          childContainerIds,
          childCreateResponses,
          childStatusChecks,
          createResponse: createJson,
          statusChecks: waitResult.checks,
          publishResponse: publishJson,
        },
      };
    }

    const mediaId = String(publishJson?.id || "");
    if (!mediaId) {
      return {
        ok: false,
        error: "La publication Instagram n’a pas pu être finalisée.",
        diagnostics: {
          containerId,
          childContainerIds,
          childCreateResponses,
          childStatusChecks,
          createResponse: createJson,
          statusChecks: waitResult.checks,
          publishResponse: publishJson,
        },
      };
    }

    return {
      ok: true,
      mediaId,
      diagnostics: {
        containerId,
        childContainerIds,
        childCreateResponses,
        childStatusChecks,
        createResponse: createJson,
        statusChecks: waitResult.checks,
        publishResponse: publishJson,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Une erreur est survenue lors de la publication Instagram." };
  }
}
