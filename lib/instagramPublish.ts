const FACEBOOK_GRAPH_VERSION = "v20.0";

type PublishOk = {
  ok: true;
  /** Published Instagram media id */
  mediaId: string;
  diagnostics?: {
    containerId?: string;
    createResponse?: any;
    statusChecks?: any[];
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
    error: "Timeout : le media Instagram n'est pas passé à l'état FINISHED",
    checks,
  };
}

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

    const createUrl = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${encodeURIComponent(igUserId)}/media?${createParams.toString()}`;
    const { res: createRes, json: createJson } = await fetchJson(createUrl, {
      method: "POST",
    });

    if (!createRes.ok) {
      return {
        ok: false,
        error: createJson?.error?.message || "Instagram media creation failed",
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

    // 2) Wait until Meta marks the container ready
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

    // 3) Publish the container
    const publishParams = new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken,
    });

    const publishUrl = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${encodeURIComponent(igUserId)}/media_publish?${publishParams.toString()}`;
    const { res: publishRes, json: publishJson } = await fetchJson(publishUrl, {
      method: "POST",
    });

    if (!publishRes.ok) {
      return {
        ok: false,
        error: publishJson?.error?.message || "Instagram publish failed",
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
        error: "Instagram publish returned no id",
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
    return { ok: false, error: e?.message || "Unknown Instagram publish error" };
  }
}
