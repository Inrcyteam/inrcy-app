import { asRecord, asString } from "@/lib/tsSafe";
import { stripTemplateSignatureBlock } from "@/lib/mailTemplateCleanup";

const SIGNATURE_IMAGE_BUCKET = "booster";

export type SupabaseLike = {
  from: (_table: string) => {
    select: (_columns: string) => {
      eq: (_column: string, _value: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    upsert: (_payload: Record<string, unknown>, _options?: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};

export const DEFAULT_INRSEND_SIGNATURE_TEMPLATE = [
  "Cordialement,",
  "{{nom_complet}}",
  "{{nom_entreprise}}",
  "Tél : {{telephone}}",
  "Email : {{email}}",
].join("\n");

function compactLines(input: string): string {
  return input
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .filter((line, index, arr) => {
      if (line.trim()) return true;
      const prev = arr[index - 1]?.trim();
      const next = arr[index + 1]?.trim();
      return !!prev && !!next;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSignatureContext(args: {
  profile?: unknown;
  account?: unknown;
}): Record<string, string> {
  const profile = asRecord(args.profile);
  const account = asRecord(args.account);
  const firstName = asString(profile.first_name)?.trim() || "";
  const lastName = asString(profile.last_name)?.trim() || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return {
    prenom: firstName,
    nom: lastName,
    nom_complet: fullName,
    nom_entreprise: asString(profile.company_legal_name)?.trim() || "",
    telephone: asString(profile.phone)?.trim() || "",
    email: asString(profile.contact_email)?.trim() || asString(account.account_email)?.trim() || "",
    adresse: asString(profile.hq_address)?.trim() || "",
    code_postal: asString(profile.hq_zip)?.trim() || "",
    ville: asString(profile.hq_city)?.trim() || "",
    boite_mail: asString(account.account_email)?.trim() || "",
    nom_expediteur:
      asString(asRecord(account.settings).display_name)?.trim() || fullName || asString(account.account_email)?.trim() || "",
  };
}

export function renderSignatureTemplate(template: string, context: Record<string, string>): string {
  const rendered = String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    return context[key] || "";
  });
  return compactLines(rendered);
}

function buildFallbackSignature(context: Record<string, string>): string {
  const company = String(context.nom_entreprise || "").trim();
  if (company) return compactLines(`L’équipe ${company}`);
  return "Envoyé via iNrCy";
}

function needsFallbackSignature(signatureText: string): boolean {
  const normalized = compactLines(signatureText).toLowerCase();
  if (!normalized) return true;
  return /^(cordialement|bien à vous|bien cordialement|merci|à bientôt|a bientôt)[,!.\s]*$/i.test(normalized);
}

export function applyAutoSignatureToText(text: string, signature: string): string {
  const base = stripTemplateSignatureBlock(String(text || "")).trimEnd();
  const sig = compactLines(signature);
  if (!sig) return base;

  const normalize = (value: string) => value.replace(/\r\n/g, "\n").trim();
  const normalizedBase = normalize(base);
  const normalizedSig = normalize(sig);
  if (!normalizedBase) return normalizedSig;
  if (normalizedBase.endsWith(normalizedSig)) return normalizedBase;
  return `${normalizedBase}\n\n${normalizedSig}`;
}

function normalizeHref(rawUrl: string): string {
  const value = String(rawUrl || "").trim();
  if (!value) return "";

  if (/^mailto:/i.test(value) || /^tel:/i.test(value)) return value;
  if (/^www\./i.test(value)) return `https://${value}`;
  return value;
}

function splitTrailingUrlPunctuation(url: string): { hrefPart: string; trailingPart: string } {
  let hrefPart = String(url || "");
  let trailingPart = "";

  while (/[.,;:!?)]$/.test(hrefPart)) {
    const last = hrefPart.slice(-1);

    // Keep balanced closing parenthesis inside the URL.
    if (last === ")") {
      const openCount = (hrefPart.match(/\(/g) || []).length;
      const closeCount = (hrefPart.match(/\)/g) || []).length;
      if (closeCount <= openCount) break;
    }

    trailingPart = last + trailingPart;
    hrefPart = hrefPart.slice(0, -1);
  }

  return { hrefPart, trailingPart };
}

function linkifyUrls(text: string): string {
  const source = String(text || "");
  const urlRegex = /((?:https?:\/\/|www\.)[^\s<]+|mailto:[^\s<]+|tel:[^\s<]+)/gi;
  let html = "";
  let lastIndex = 0;

  for (const match of source.matchAll(urlRegex)) {
    const rawMatch = match[0];
    const index = match.index ?? 0;
    const { hrefPart, trailingPart } = splitTrailingUrlPunctuation(rawMatch);
    const href = normalizeHref(hrefPart);

    html += escapeHtml(source.slice(lastIndex, index));

    if (href) {
      html += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${escapeHtml(hrefPart)}</a>${escapeHtml(trailingPart)}`;
    } else {
      html += escapeHtml(rawMatch);
    }

    lastIndex = index + rawMatch.length;
  }

  html += escapeHtml(source.slice(lastIndex));
  return html;
}

export function textToSimpleHtml(text: string): string {
  const linked = linkifyUrls(text).replace(/\n/g, "<br/>");
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif; white-space:normal; line-height:1.5;">${linked}</div>`;
}

export function applyAutoSignatureToHtml(baseHtml: string, signatureText: string, signatureImageUrl?: string | null, signatureImageWidth?: number | null): string {
  const safeBaseHtml = String(baseHtml || "").trim();
  const safeSignatureText = compactLines(signatureText || "");
  const safeImageUrl = asString(signatureImageUrl)?.trim() || "";
  const normalizedWidth = Number.isFinite(Number(signatureImageWidth)) ? Math.max(180, Math.min(600, Number(signatureImageWidth))) : 400;

  const parts: string[] = [];
  if (safeBaseHtml) parts.push(safeBaseHtml);
  if (safeSignatureText) parts.push(textToSimpleHtml(safeSignatureText));
  if (safeImageUrl) {
    const escapedUrl = escapeHtml(safeImageUrl);
    parts.push(
      `<div style="margin-top:12px;"><img src="${escapedUrl}" alt="Signature" width="${normalizedWidth}" style="width:${normalizedWidth}px;max-width:100%;height:auto;display:block;border:0;" /></div>`
    );
  }

  return parts.join('<div style="height:16px"></div>');
}

function buildPublicStorageUrl(bucket: string, path: string): string {
  const baseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const normalizedPath = String(path || "")
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  if (!baseUrl || !normalizedPath) return "";
  return `${baseUrl}/storage/v1/object/public/${bucket}/${normalizedPath}`;
}

export async function getInrSendSignatureSettings(supabase: SupabaseLike, userId: string) {
  const [cfgRes, profileRes] = await Promise.all([
    supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
    supabase
      .from("profiles")
      .select("first_name,last_name,company_legal_name,phone,contact_email,hq_address,hq_zip,hq_city")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const cfgSettings = asRecord(asRecord(cfgRes.data).settings);
  const inrsend = asRecord(cfgSettings.inrsend);
  const profile = profileRes.data;
  const enabled = inrsend.signature_enabled !== false;
  const template = asString(inrsend.signature_template)?.trim() || DEFAULT_INRSEND_SIGNATURE_TEMPLATE;
  const imagePath = asString(inrsend.signature_image_path)?.trim() || "";
  const legacyImageUrl = asString(inrsend.signature_image_url)?.trim() || "";
  const imageUrl = imagePath ? buildPublicStorageUrl(SIGNATURE_IMAGE_BUCKET, imagePath) : legacyImageUrl;
  const imageWidthRaw = Number(asString(inrsend.signature_image_width) || 400);
  const imageWidth = Number.isFinite(imageWidthRaw) ? Math.max(180, Math.min(600, imageWidthRaw)) : 400;

  return {
    enabled,
    template,
    imagePath,
    imageUrl,
    imageWidth,
    profile,
  };
}

export async function buildInrSendSignature(args: {
  supabase: SupabaseLike;
  userId: string;
  account?: unknown;
}): Promise<{ enabled: boolean; template: string; imagePath: string; imageUrl: string; imageWidth: number; signatureText: string }> {
  const { enabled, template, imagePath, imageUrl, imageWidth, profile } = await getInrSendSignatureSettings(args.supabase, args.userId);
  const context = buildSignatureContext({ profile, account: args.account });
  const renderedSignatureText = enabled ? renderSignatureTemplate(template, context) : "";
  const signatureText = enabled && needsFallbackSignature(renderedSignatureText) ? buildFallbackSignature(context) : renderedSignatureText;
  return { enabled, template, imagePath, imageUrl, imageWidth, signatureText };
}
