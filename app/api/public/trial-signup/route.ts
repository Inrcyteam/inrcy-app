import { NextResponse } from "next/server";

import { optionalEnv, requireEnv } from "@/lib/env";
import { getClientIp, enforceRateLimit } from "@/lib/rateLimit";
import { ensureNotificationPreferences } from "@/lib/notifications";
import { getAppUrl } from "@/lib/stripeRest";
import { sendAdminSubscriptionAlertForUser } from "@/lib/subscriptionAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureTrialSubscription } from "@/lib/trialSubscription";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";

export const runtime = "nodejs";

type LooseRecord = Record<string, unknown>;

type SignupPayload = {
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  phone: string;
  legalForm: string;
  source: string;
  notes: string;
  consent: boolean;
  honeypot: string;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function toPlainObject(value: unknown): LooseRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as LooseRecord;
}

function extractScalarStrings(input: unknown, out: Record<string, string>, parentKey = "") {
  if (input == null) return;

  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
    const key = parentKey.trim();
    if (key) out[key] = String(input).trim();
    return;
  }

  if (Array.isArray(input)) {
    input.forEach((item, index) => {
      extractScalarStrings(item, out, parentKey ? `${parentKey}[${index}]` : String(index));
    });
    return;
  }

  if (typeof input === "object") {
    for (const [rawKey, rawValue] of Object.entries(input as LooseRecord)) {
      const key = rawKey.trim();
      const nextKey = parentKey ? `${parentKey}.${key}` : key;
      extractScalarStrings(rawValue, out, nextKey);

      if (
        rawValue &&
        typeof rawValue === "object" &&
        !Array.isArray(rawValue) &&
        Object.prototype.hasOwnProperty.call(rawValue, "value")
      ) {
        const value = (rawValue as LooseRecord).value;
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          out[key] = String(value).trim();
        }
      }
    }
  }
}

function lookupValue(flat: Record<string, string>, aliases: string[]) {
  const normalized = new Map<string, string>();

  for (const [key, value] of Object.entries(flat)) {
    const variants = [
      key,
      key.toLowerCase(),
      key.replace(/^fields\./i, ""),
      key.replace(/^fields\./i, "").toLowerCase(),
    ];
    for (const variant of variants) {
      normalized.set(variant, value);
    }
  }

  for (const alias of aliases) {
    const direct = normalized.get(alias);
    if (direct) return direct.trim();
    const lower = normalized.get(alias.toLowerCase());
    if (lower) return lower.trim();
  }

  return "";
}

async function readRequestBody(req: Request): Promise<LooseRecord> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return toPlainObject(await req.json().catch(() => ({})));
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const raw = await req.text().catch(() => "");
    return Object.fromEntries(new URLSearchParams(raw));
  }

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData().catch(() => null);
    if (!formData) return {};
    const entries: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      entries[key] = typeof value === "string" ? value : value.name;
    }
    return entries;
  }

  const raw = await req.text().catch(() => "");
  if (!raw) return {};

  try {
    return toPlainObject(JSON.parse(raw));
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

function normalizePayload(body: LooseRecord): SignupPayload {
  const flat: Record<string, string> = {};
  extractScalarStrings(body, flat);

  return {
    email: lookupValue(flat, ["email", "e-mail", "mail", "your-email"])
      .trim()
      .toLowerCase(),
    firstName: lookupValue(flat, ["first_name", "firstname", "prenom", "prénom", "first-name"]),
    lastName: lookupValue(flat, ["last_name", "lastname", "nom", "last-name"]),
    companyName: lookupValue(flat, [
      "company",
      "company_name",
      "company_legal_name",
      "societe",
      "société",
      "entreprise",
      "business_name",
    ]),
    phone: lookupValue(flat, ["phone", "telephone", "téléphone", "tel", "mobile"]),
    legalForm: lookupValue(flat, ["legal_form", "forme_juridique", "legal-form"]),
    source: lookupValue(flat, ["source", "form_name", "form-id"]),
    notes: lookupValue(flat, ["message", "notes", "commentaire", "comments"]),
    consent:
      ["1", "true", "yes", "oui", "on"].includes(
        lookupValue(flat, ["consent", "rgpd", "privacy", "acceptance"]).toLowerCase()
      ),
    honeypot: lookupValue(flat, ["website", "site_web", "company_website", "url"]),
  };
}

function resolveSharedSecret(req: Request, body: LooseRecord) {
  const url = new URL(req.url);
  const bodySecret = String((body.token ?? body.secret ?? body.webhook_secret ?? "") || "").trim();
  return (
    req.headers.get("x-trial-signup-secret") ||
    req.headers.get("x-admin-secret") ||
    url.searchParams.get("token") ||
    bodySecret ||
    ""
  ).trim();
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const limited = await enforceRateLimit({
      name: "public_trial_signup",
      identifier: ip,
      limit: 8,
      window: "10 m",
      failClosed: false,
    });
    if (limited) return limited;

    const body = await readRequestBody(req);
    const expectedSecret = requireEnv("INRCY_TRIAL_SIGNUP_SECRET");
    const gotSecret = resolveSharedSecret(req, body);
    if (gotSecret !== expectedSecret) {
      return jsonResponse({ error: "Accès non autorisé." }, 401);
    }

    const payload = normalizePayload(body);

    if (payload.honeypot) {
      return jsonResponse({ ok: true });
    }

    if (!payload.email) {
      return jsonResponse({ error: "Email manquant." }, 400);
    }

    const appUrl = getAppUrl(req) || requireEnv("NEXT_PUBLIC_APP_URL");
    const redirectTo = `${appUrl.replace(/\/$/, "")}/set-password?mode=invite`;

    const { data: invite, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(payload.email, {
      redirectTo,
      data: {
        first_name: payload.firstName || undefined,
        last_name: payload.lastName || undefined,
        company_legal_name: payload.companyName || undefined,
        phone: payload.phone || undefined,
        source: payload.source || "wordpress-elementor",
      },
    });

    if (inviteError) {
      const msg = inviteError.message.toLowerCase();
      if (
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists") ||
        msg.includes("already been registered")
      ) {
        return jsonResponse(
          {
            error:
              "Un compte existe déjà avec cet email. Le professionnel peut se connecter directement ou utiliser “Mot de passe oublié”.",
          },
          409
        );
      }
      throw new Error(inviteError.message);
    }

    const userId = invite.user.id;
    const nowIso = new Date().toISOString();

    const profilePatch: LooseRecord = {
      user_id: userId,
      admin_email: payload.email,
      contact_email: payload.email,
      updated_at: nowIso,
    };
    if (payload.firstName) profilePatch.first_name = payload.firstName;
    if (payload.lastName) profilePatch.last_name = payload.lastName;
    if (payload.phone) profilePatch.phone = payload.phone;
    if (payload.companyName) profilePatch.company_legal_name = payload.companyName;
    if (payload.legalForm) profilePatch.legal_form = payload.legalForm;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(profilePatch, { onConflict: "user_id" });
    if (profileError) throw new Error(profileError.message);

    await ensureNotificationPreferences(userId);
    const { trialDays, start, end } = await ensureTrialSubscription(userId, payload.email);

    await sendAdminSubscriptionAlertForUser({
      type: "trial_started",
      source: payload.source || optionalEnv("INRCY_MARKETING_SOURCE", "wordpress-elementor"),
      userId,
      accountEmail: payload.email,
      profileContactEmail: payload.email,
      plan: "Trial",
      status: "trialing",
      trialStartAt: start.toISOString(),
      trialEndAt: end.toISOString(),
      note: [
        payload.companyName ? `Société: ${payload.companyName}` : null,
        payload.phone ? `Téléphone: ${payload.phone}` : null,
        payload.notes ? `Note: ${payload.notes}` : null,
        payload.consent ? "Consentement RGPD coché" : null,
      ]
        .filter(Boolean)
        .join(" | "),
    }).catch(() => null);

    return jsonResponse({
      ok: true,
      user_id: userId,
      trial_days: trialDays,
      trial_end_at: end.toISOString(),
      message: "Invitation envoyée. Le professionnel peut créer son mot de passe depuis l'email reçu.",
    });
  } catch (error: unknown) {
    const message = getSimpleFrenchErrorMessage(
      error,
      "Le service est momentanément indisponible. Merci de réessayer dans quelques minutes."
    );
    return jsonResponse({ error: message }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "POST, OPTIONS",
    },
  });
}
