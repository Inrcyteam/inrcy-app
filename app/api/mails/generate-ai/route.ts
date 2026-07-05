import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { openaiGenerateJSON } from "@/lib/openaiClient";
import { enforceRateLimit } from "@/lib/rateLimit";
import { asRecord } from "@/lib/tsSafe";
import { normalizeMailSubject } from "@/lib/mailEncoding";
import { stripTemplateSignatureBlock } from "@/lib/mailTemplateCleanup";
import { getJobLabel } from "@/lib/activityCatalog";
import { decodeBusinessSector, getActivitySectorLabel } from "@/lib/activitySectors";
import { buildAiLanguageInstruction, buildAiWritingProfilePromptSection, buildAiWritingProfileRules } from "@/lib/aiWritingProfile";
import { parseMailAttachmentRefs } from "@/lib/mailAttachmentRefs";
import { buildMailAttachmentAiPromptSection } from "@/lib/aiAttachmentContext";
import { computeMailAiCredits, consumeAiCredits, isAdminUserForAi } from "@/lib/aiUsageQuota";

export const maxDuration = 60;

type GeneratedMail = {
  body_text?: unknown;
};


const MAIL_WRITING_TYPE_LABELS: Record<string, string> = {
  auto: "Automatique",
  presentation: "Présentation",
  prospection: "Prospection",
  relance: "Relance",
  thanks: "Remerciement",
  info: "Information",
  offer: "Offre commerciale",
  reply: "Réponse client",
  meeting: "Invitation / RDV",
};

function normalizeMailWritingType(value: unknown) {
  const key = String(value ?? "auto").trim();
  return MAIL_WRITING_TYPE_LABELS[key] ? key : "auto";
}

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
    const { supabase, authUserId, errorResponse, activeUserId } = await requireUser();
    if (errorResponse) return errorResponse;

    const body = asRecord(await req.json().catch(() => ({})) as unknown);
    const subject = normalizeMailSubject(clean(body["subject"], 220));
    const currentBody = stripTemplateSignatureBlock(clean(body["body"], 4000));
    const writingTypeKey = normalizeMailWritingType(body["writingType"] ?? body["mailType"]);
    const writingTypeLabel = MAIL_WRITING_TYPE_LABELS[writingTypeKey] || MAIL_WRITING_TYPE_LABELS.auto;
    const attachmentRefs = parseMailAttachmentRefs(body["attachments"]);

    if (!subject.trim()) {
      return NextResponse.json({ error: "Renseignez d’abord un objet pour générer votre mail avec iNrCy." }, { status: 400 });
    }

    const userId = activeUserId;
    const isAdmin = await isAdminUserForAi(supabase, authUserId);

    if (!isAdmin) {
      const rateLimited = await enforceRateLimit({
        name: "mail_ai",
        identifier: authUserId,
        limit: 60,
        window: "1 d",
        failClosed: false,
      });
      if (rateLimited) return rateLimited;

      const quotaLimited = await consumeAiCredits({
        supabase,
        userId: authUserId,
        action: "mail",
        credits: computeMailAiCredits(attachmentRefs),
      });
      if (quotaLimited) return quotaLimited;
    }

    const [profileRes, businessRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("business_profiles").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
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
    const aiLanguageInstruction = buildAiLanguageInstruction(business);
    const attachmentContext = await buildMailAttachmentAiPromptSection(supabase, attachmentRefs, {
      userId,
      maxFiles: 4,
      maxFileBytes: 8 * 1024 * 1024,
      maxTotalChars: 6500,
      maxCharsPerFile: 2200,
    });

    const system = `Tu es le rédacteur IA d'iNrCy pour des emails professionnels.
Réponds uniquement en JSON valide : {"body_text":"..."}.
Objectif : rédiger le corps d'un mail prêt à envoyer à partir de l'objet fourni.
Règles strictes :
- Ne modifie pas l'objet : il sert uniquement de sujet.
- Respecter le type d’écriture demandé. Si le type est "Automatique", déduire l'intention depuis l'objet.
- Ne jamais inventer d'avis, de prix, de délai, de certification, de promotion ou de résultat.
- Ne pas inclure de signature complète : l'application ajoute déjà la signature automatique.
- Garder un email naturel, utile, humain, clair et adapté à l'entreprise.
- Respecter la Configuration IA du professionnel, dont la langue de génération.
- Respecter strictement l'instruction de langue prioritaire : la langue de l'objet, du message actuel ou des pièces jointes ne doit pas changer la langue finale demandée.
- Si un message existe déjà, tu peux t'en inspirer sans le copier.
- Si des pièces jointes sont fournies, utiliser leurs informations uniquement si elles améliorent le message, sans les recopier mot pour mot.
- Ne jamais inventer le contenu d'une pièce jointe non lisible : dans ce cas, tenir compte seulement de son nom et de son type.
- Éviter les mots ou formes qui font spam : MAJUSCULES, promesses exagérées, urgence forcée, trop de points d'exclamation.
- Ne pas ajouter de markdown lourd ni de HTML. Texte brut uniquement.
${aiLanguageInstruction}
${aiRules}`;

    const input = `Objet du mail :
${subject}

Type d’écriture demandé : ${writingTypeLabel}

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

Instruction de langue prioritaire :
${aiLanguageInstruction}

Contexte des pièces jointes, si présent :
${attachmentContext || "Aucune pièce jointe exploitable."}

Message actuel, si présent :
${currentBody || "Aucun"}

Rédige uniquement le corps du mail, avec une salutation, un message clair et une fin simple. L'objet doit rester inchangé.
Si le type d’écriture est précisé, adapte l'intention du message à ce type sans devenir artificiel.
Si des pièces jointes existent, les mentionner seulement quand cela aide le destinataire à comprendre le mail.`;

    const generated = await openaiGenerateJSON<GeneratedMail>({
      system,
      input,
      maxOutputTokens: 1100,
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
