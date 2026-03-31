import { asRecord, asString } from "@/lib/tsSafe";

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    upsert?: (payload: Record<string, unknown>, options?: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};

export const DEFAULT_INRSEND_SIGNATURE_TEMPLATE = [
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

export function applyAutoSignatureToText(text: string, signature: string): string {
  const base = String(text || "").trimEnd();
  const sig = compactLines(signature);
  if (!sig) return base;
  const normalize = (value: string) => value.replace(/\r\n/g, "\n").trim();
  const normalizedBase = normalize(base);
  const normalizedSig = normalize(sig);
  if (!normalizedBase) return normalizedSig;
  if (normalizedBase.endsWith(normalizedSig)) return normalizedBase;
  return `${normalizedBase}\n\n${normalizedSig}`;
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

  return {
    enabled,
    template,
    profile,
  };
}

export async function buildInrSendSignature(args: {
  supabase: SupabaseLike;
  userId: string;
  account?: unknown;
}): Promise<{ enabled: boolean; template: string; signatureText: string }> {
  const { enabled, template, profile } = await getInrSendSignatureSettings(args.supabase, args.userId);
  const context = buildSignatureContext({ profile, account: args.account });
  const signatureText = enabled ? renderSignatureTemplate(template, context) : "";
  return { enabled, template, signatureText };
}
