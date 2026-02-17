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
    if (!accessToken) return { ok: false, error: "Missing LinkedIn access token" };
    if (!authorUrn) return { ok: false, error: "Missing LinkedIn author URN" };
    if (!text?.trim()) return { ok: false, error: "Empty post text" };

    const payload = {
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
    };

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

    const raw = await res.text().catch(() => "");
    let json: any = null;
    if (raw) {
      try {
        json = JSON.parse(raw);
      } catch {
        json = null;
      }
    }

    if (!res.ok) {
      const errMsg = json?.message || json?.error || raw || `LinkedIn publish failed (${res.status})`;
      return { ok: false, error: errMsg, diagnostics: { status: res.status, body: json ?? raw } };
    }

    const postUrn = res.headers.get("x-restli-id") || json?.id;
    return { ok: true, postUrn: postUrn || undefined, diagnostics: { status: res.status, body: json ?? raw } };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Unknown LinkedIn publish error" };
  }
}
