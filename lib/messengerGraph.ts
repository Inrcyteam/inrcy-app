// Minimal helpers for Meta Messenger (Facebook Graph API)
// This file is intentionally dependency-free (uses native fetch).

export type FbTokenExchange = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string; type?: string; code?: number; fbtrace_id?: string };
};

export type FbPage = {
  id: string;
  name?: string;
  access_token?: string;
};

export type FbConversation = {
  id: string;
  updated_time?: string;
  snippet?: string;
};

export type FbMessage = {
  id: string;
  created_time?: string;
  message?: string;
  from?: { id?: string; name?: string };
  to?: { data?: { id?: string; name?: string }[] };
};

function graphBase() {
  return process.env.FACEBOOK_GRAPH_BASE || "https://graph.facebook.com";
}

function graphVersion() {
  // Keep in sync with your Meta app settings.
  return process.env.FACEBOOK_API_VERSION || "v20.0";
}

export async function fbFetchJson<T>(pathOrUrl: string, init?: RequestInit): Promise<T> {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${graphBase()}/${graphVersion()}/${pathOrUrl.replace(/^\//, "")}`;

  const res = await fetch(url, { cache: "no-store", ...init });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export function messengerScopes(): string {
  // These are the most common permissions needed for a Page inbox.
  // Some require Advanced Access / App Review in production.
  const fallback = [
    "public_profile",
  ];

  const fromEnv = process.env.MESSENGER_SCOPES?.split(",").map((s) => s.trim()).filter(Boolean);
  return (fromEnv && fromEnv.length ? fromEnv : fallback).join(",");
}
