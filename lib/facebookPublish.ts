type FbUploadResp = { id?: string; post_id?: string; error?: { message?: string } };
type FbFeedResp = { id?: string; error?: { message?: string } };

async function postForm(url: string, form: URLSearchParams) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
  return j;
}

export async function facebookPublishToPage(args: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  imageUrls?: string[];
}) {
  const pageId = args.pageId;
  const token = args.pageAccessToken;
  const message = args.message;
  const imageUrls = (args.imageUrls || []).filter(Boolean).slice(0, 5);

  // No images: simple feed post
  if (!imageUrls.length) {
    const url = `https://graph.facebook.com/v20.0/${pageId}/feed`;
    const form = new URLSearchParams({
      message,
      access_token: token,
    });
    const resp = (await postForm(url, form)) as FbFeedResp;
    return { postId: resp.id || null };
  }

  // Upload photos unpublished, collect media IDs, then create feed with attached_media
  const mediaFbids: string[] = [];
  for (const imgUrl of imageUrls) {
    const url = `https://graph.facebook.com/v20.0/${pageId}/photos`;
    const form = new URLSearchParams({
      url: imgUrl,
      published: "false",
      access_token: token,
    });
    const resp = (await postForm(url, form)) as FbUploadResp;
    if (resp?.id) mediaFbids.push(resp.id);
  }

  const feedUrl = `https://graph.facebook.com/v20.0/${pageId}/feed`;
  const form = new URLSearchParams({
    message,
    access_token: token,
  });

  // attached_media must be like attached_media[0]={"media_fbid":"..."}
  mediaFbids.forEach((id, idx) => {
    form.set(`attached_media[${idx}]`, JSON.stringify({ media_fbid: id }));
  });

  const feedResp = (await postForm(feedUrl, form)) as FbFeedResp;
  return { postId: feedResp.id || null, mediaFbids };
}
