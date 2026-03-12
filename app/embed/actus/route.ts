import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { asRecord } from "@/lib/tsSafe";
import { renderEmbedHtml, type FontMode, type LayoutMode, type ThemeMode } from "./_lib/render";

export const runtime = "nodejs";

type WidgetTokenPayload = {
  v: 1;
  domain: string;
  source: string;
  iat: number;
  exp: number;
};

function b64urlEncode(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecodeToBuffer(s: string) {
  const pad = s.length % 4;
  const base64 = (s + (pad ? "=".repeat(4 - pad) : "")).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

function verifyWidgetToken(token: string, secret: string): WidgetTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid token format");
  const [body, sig] = parts;
  const expected = b64urlEncode(crypto.createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("Invalid token signature");

  const payload = JSON.parse(b64urlDecodeToBuffer(body).toString("utf8")) as WidgetTokenPayload;
  if (!payload || payload.v !== 1) throw new Error("Invalid token payload");
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) throw new Error("Token expired");
  return payload;
}

function normalizeDomain(input: string | null): string {
  if (!input) return "";
  let raw = input.trim();
  try {
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    const u = new URL(raw);
    return (u.hostname || "").toLowerCase().replace(/^www\./, "");
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0];
  }
}

function getRefererHost(req: Request): string {
  const ref = req.headers.get("referer") || "";
  if (!ref) return "";
  try {
    return new URL(ref).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function resolveUserIdFromDomain(domain: string, source: string) {
  const supabase = getSupabaseAdmin();

  if (source === "inrcy_site") {
    const { data, error } = await supabase
      .from("inrcy_site_configs")
      .select("user_id, site_url")
      .ilike("site_url", `%${domain}%`)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (asRecord(data)["user_id"] as string | null) ?? null;
  }

  const { data, error } = await supabase.from("pro_tools_configs").select("user_id, settings").limit(200);
  if (error) throw error;
  const rows = (data || []) as unknown[];
  const match = rows.find((r) => {
    const settings = asRecord(asRecord(r)["settings"]);
    const siteWeb = asRecord(settings["site_web"]);
    return normalizeDomain(String(siteWeb["url"] ?? "")) === domain;
  });
  return (asRecord(match)["user_id"] as string | null) ?? null;
}

async function fetchArticles(domain: string, source: string, limit: number) {
  const userId = await resolveUserIdFromDomain(domain, source);
  if (!userId) return [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("site_articles")
    .select("id, created_at, title, content, images")
    .eq("user_id", userId)
    .eq("source", source)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as Array<Record<string, unknown>>;
}

function clampLimit(value: string | null) {
  const parsed = parseInt(value || "5", 10) || 5;
  return Math.min(7, Math.max(3, parsed));
}

function clampFont(value: string | null): FontMode {
  const v = (value || "site").trim().toLowerCase();
  return v === "inter" || v === "poppins" || v === "montserrat" || v === "lora" ? v : "site";
}

function clampTheme(value: string | null): ThemeMode {
  const v = (value || "nature").trim().toLowerCase();
  return v === "white" || v === "dark" || v === "gray" || v === "nature" || v === "sand" ? v : "nature";
}

function htmlResponse(html: string, status = 200) {
  return new NextResponse(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const domain = normalizeDomain(searchParams.get("domain"));
    const source = (searchParams.get("source") || "site_web").trim();
    const title = (searchParams.get("title") || "Actualités").trim();
    const limit = clampLimit(searchParams.get("limit"));
    const layout = (searchParams.get("layout") === "carousel" ? "carousel" : "list") as LayoutMode;
    const font = clampFont(searchParams.get("font"));
    const theme = clampTheme(searchParams.get("theme"));
    const frameId = (searchParams.get("frameId") || "inrcy-embed").trim().slice(0, 120);
    const token = searchParams.get("token") || "";

    if (!domain) return htmlResponse(renderEmbedHtml({ title, articles: [], layout, font, theme, frameId }), 400);
    if (source !== "inrcy_site" && source !== "site_web") return htmlResponse(renderEmbedHtml({ title, articles: [], layout, font, theme, frameId }), 400);
    if (!token) return htmlResponse(renderEmbedHtml({ title, articles: [], layout, font, theme, frameId }), 401);

    const signingSecret = process.env.INRCY_WIDGETS_SIGNING_SECRET;
    if (!signingSecret) throw new Error("Missing INRCY_WIDGETS_SIGNING_SECRET");

    const tok = verifyWidgetToken(token, signingSecret);
    const tokDomain = normalizeDomain(tok.domain);
    const tokSource = String(tok.source || "").trim();
    if (tokDomain !== domain || tokSource !== source) return htmlResponse(renderEmbedHtml({ title, articles: [], layout, font, theme, frameId }), 403);

    const refHost = getRefererHost(req);
    if (refHost && refHost !== tokDomain) return htmlResponse(renderEmbedHtml({ title, articles: [], layout, font, theme, frameId }), 403);

    const articles = await fetchArticles(domain, source, limit);
    return htmlResponse(renderEmbedHtml({ title, articles, layout, font, theme, frameId }), 200);
  } catch {
    return htmlResponse(renderEmbedHtml({ title: "Actualités", articles: [], layout: "list", font: "site", theme: "nature", frameId: "inrcy-embed" }), 500);
  }
}
