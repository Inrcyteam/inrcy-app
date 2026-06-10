import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { openaiGenerateJSON } from "@/lib/openaiClient";
import { enforceRateLimit } from "@/lib/rateLimit";
import { asRecord } from "@/lib/tsSafe";
import { normalizeMailSubject } from "@/lib/mailEncoding";
import { stripTemplateSignatureBlock } from "@/lib/mailTemplateCleanup";
import { getJobLabel } from "@/lib/activityCatalog";
import { decodeBusinessSector, getActivitySectorLabel } from "@/lib/activitySectors";
import { buildAiWritingProfilePromptSection, buildAiWritingProfileRules } from "@/lib/aiWritingProfile";

export const maxDuration = 60;

type GeneratedMail = {
  body_text?: unknown;
};

const clean = (value: unknown, max = 600) => String(value ?? "").trim().slice(0, max);

function listFrom(value: unknown, max = 8) {
  if (Array.isArray(value)) return value.map((v) => clean(v, 80)).filter(Boolean).slice(0, max);
  return clean(value, 600)
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, max);
}

export async function POST(req: Request) {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const body = asRecord(await req.json().catch(() => ({})) as unknown);
    const subject = normalizeMailSubject(clean(body["subject"], 220));
    const currentBody = stripTemplateSignatureBlock(clean(body["body"], 4000));

    if (!subject.trim()) {
      return NextResponse.json({ error: "Renseignez d’abord un objet pour générer votre mail avec iNrCy." }, { status: 400 });
    }

    const rateLimited = await enforceRateLimit({
      name: "mail_ai",
      identifier: user.id,
      limit: 60,
      window: "1 d",
      failClosed: false,
    });
    if (rateLimited) return rateLimited;

    const userId = user.id;
    const [profileRes, businessRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("business_profiles").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    const profile = asRecord(profileRes.data);
    const business = asRecord(businessRes.data);
    const decodedSector = decodeBusinessSector(String(business["sector"] ?? ""));
    const profession = getJobLabel(decodedSector.sectorCategory, decodedSector.profession) || decodedSector.profession || "";
    const sectorLabel = getActivitySectorLabel(decodedSector.sectorCategory);

    const company = clean(profile["company_legal_name"] || profile["company_name"] || business["company_name"], 160);
    const city = clean(profile["hq_city"] || profile["hqCity"], 80);
    const activityDescription = clean(business["activity_description"] || business["description"] || business["business_description"], 800);
    const services = listFrom(business["services"] || business["services_text"], 10);
    const zones = listFrom(business["intervention_zones"] || business["intervention_zones_text"], 8);
    const strengths = listFrom(business["strengths"] || business["strengths_text"], 8);

    const aiConfig = buildAiWritingProfilePromptSection(business);
    const aiRules = buildAiWritingProfileRules();

    const system = `Tu es le rédacteur IA d'iNrCy pour des emails professionnels français.
Réponds uniquement en JSON valide : {"body_text":"..."}.
Objectif : rédiger le corps d'un mail prêt à envoyer à partir de l'objet fourni.
Règles strictes :
- Ne modifie pas l'objet : il sert uniquement de sujet.
- Ne jamais inventer d'avis, de prix, de délai, de certification, de promotion ou de résultat.
- Ne pas inclure de signature complète : l'application ajoute déjà la signature automatique.
- Garder un email naturel, utile, humain, clair et adapté à l'entreprise.
- Respecter la Configuration IA du professionnel.
- Si un message existe déjà, tu peux t'en inspirer sans le copier.
- Ne pas ajouter de markdown lourd ni de HTML. Texte brut uniquement.
${aiRules}`;

    const input = `Objet du mail :
${subject}

Entreprise : ${company || "Non précisée"}
Ville : ${city || "Non précisée"}
Secteur : ${sectorLabel || "Non précisé"}
Métier : ${profession || "Non précisé"}
Description activité : ${activityDescription || "Non précisée"}
Prestations : ${services.length ? services.join(", ") : "Non précisées"}
Zones : ${zones.length ? zones.join(", ") : "Non précisées"}
Forces : ${strengths.length ? strengths.join(", ") : "Non précisées"}

Configuration IA :
${aiConfig || "- Non précisée"}

Message actuel, si présent :
${currentBody || "Aucun"}

Rédige uniquement le corps du mail, avec une salutation, un message clair et une fin simple. L'objet doit rester inchangé.`;

    const generated = await openaiGenerateJSON<GeneratedMail>({
      system,
      input,
      maxOutputTokens: 900,
      temperature: 0.78,
    });

    const bodyText = stripTemplateSignatureBlock(clean(generated.body_text, 5000));
    if (!bodyText) {
      return NextResponse.json({ error: "iNrCy n’a pas retourné de message exploitable." }, { status: 500 });
    }

    return NextResponse.json({ body_text: bodyText });
  } catch (error) {
    console.error("mails/generate-ai", error);
    return NextResponse.json({ error: "La génération IA n’a pas pu aboutir." }, { status: 500 });
  }
}
