import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { openaiGenerateJSON } from "@/lib/openaiClient";
import { enforceRateLimit } from "@/lib/rateLimit";
import { asRecord } from "@/lib/tsSafe";
import { renderWithContext, buildDefaultContext } from "@/lib/templateEngine";
import { hasActiveInrcySite } from "@/lib/inrcySite";
import { normalizeMailSubject } from "@/lib/mailEncoding";
import { stripTemplateSignatureBlock } from "@/lib/mailTemplateCleanup";
import { getJobLabel } from "@/lib/activityCatalog";
import { decodeBusinessSector, getActivitySectorLabel } from "@/lib/activitySectors";
import { buildAiLanguageInstruction, buildAiWritingProfilePromptSection, buildAiWritingProfileRules } from "@/lib/aiWritingProfile";
import { parseMailAttachmentRefs } from "@/lib/mailAttachmentRefs";
import { buildMailAttachmentAiPromptSection } from "@/lib/aiAttachmentContext";
import { computeTemplateAiCredits, consumeAiCredits, isAdminUserForAi } from "@/lib/aiUsageQuota";

export const maxDuration = 60;

type GeneratedTemplateMail = {
  subject?: unknown;
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
    const templateModule = clean(body["module"], 40) || "propulser";
    const mission = clean(body["mission"], 80) || "Email client";
    const templateTitle = clean(body["template_title"], 140);
    const templateCategory = clean(body["template_category"], 140);
    const currentSubject = clean(body["subject"], 220);
    const currentBody = clean(body["body"], 6000);
    const attachmentRefs = parseMailAttachmentRefs(body["attachments"]);

    if (!currentSubject && !currentBody) {
      return NextResponse.json({ error: "Aucun modèle à reformuler." }, { status: 400 });
    }

    const userId = user.id;
    const isAdmin = await isAdminUserForAi(supabase, userId);

    if (!isAdmin) {
      const rateLimited = await enforceRateLimit({
        name: "template_ai",
        identifier: userId,
        limit: 40,
        window: "1 d",
        failClosed: false,
      });
      if (rateLimited) return rateLimited;

      const quotaLimited = await consumeAiCredits({
        supabase,
        userId,
        action: "template",
        credits: computeTemplateAiCredits(attachmentRefs),
      });
      if (quotaLimited) return quotaLimited;
    }

    const [profileRes, businessRes, inrcyCfgRes, proCfgRes, integrationsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("business_profiles").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("inrcy_site_configs").select("site_url").eq("user_id", userId).maybeSingle(),
      supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
      supabase
        .from("integrations")
        .select("provider,status,resource_id,resource_label")
        .eq("user_id", userId)
        .in("provider", ["google", "facebook"]),
    ]);

    const profile = asRecord(profileRes.data);
    const business = asRecord(businessRes.data);
    const decodedSector = decodeBusinessSector(String(business["sector"] ?? ""));
    const profession = getJobLabel(decodedSector.sectorCategory, decodedSector.profession) || decodedSector.profession || "";
    const sectorLabel = getActivitySectorLabel(decodedSector.sectorCategory);

    const ownership = String(profile["inrcy_site_ownership"] ?? "none");
    const inrcyUrl = clean(asRecord(inrcyCfgRes.data)["site_url"], 300);
    const proSettings = asRecord(asRecord(proCfgRes.data)["settings"]);
    const siteWebUrl = clean(asRecord(proSettings["site_web"])["url"], 300);
    const siteUrl = hasActiveInrcySite(ownership) && inrcyUrl ? inrcyUrl : siteWebUrl;

    let facebookUrl = "";
    let gmbUrl = "";
    for (const row0 of (integrationsRes.data ?? []) as unknown[]) {
      const row = asRecord(row0);
      if (row["provider"] === "facebook" && row["status"] === "connected" && row["resource_id"]) {
        facebookUrl = `https://www.facebook.com/${String(row["resource_id"])}`;
      }
      if (row["provider"] === "google" && row["status"] === "connected" && row["resource_id"]) {
        const gmbLabel = clean(row["resource_label"] || row["resource_id"], 160);
        gmbUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gmbLabel)}`;
      }
    }

    const ctx = buildDefaultContext({
      profile,
      business,
      links: { site_url: siteUrl, facebook_url: facebookUrl, gmb_url: gmbUrl, review_url: gmbUrl || siteUrl },
    });

    const renderedSubject = normalizeMailSubject(renderWithContext(currentSubject, ctx));
    const renderedBody = stripTemplateSignatureBlock(renderWithContext(currentBody, ctx));

    const company = clean(profile["company_legal_name"] || profile["company_name"] || business["company_name"], 160);
    const city = clean(profile["hq_city"] || profile["hqCity"], 80);
    const activityDescription = clean(business["activity_description"] || business["description"] || business["business_description"], 800);
    const services = listFrom(business["services"] || business["services_text"], 10);
    const zones = listFrom(business["intervention_zones"] || business["intervention_zones_text"], 8);
    const strengths = listFrom(business["strengths"] || business["strengths_text"], 8);

    const aiConfig = buildAiWritingProfilePromptSection(business);
    const aiRules = buildAiWritingProfileRules();
    const aiLanguageInstruction = buildAiLanguageInstruction(business);
    const attachmentContext = await buildMailAttachmentAiPromptSection(supabase, attachmentRefs, { userId });

    const system = `Tu es le rédacteur IA d'iNrCy pour des emails professionnels. Tu réécris des modèles Propulser/Fidéliser.
Réponds uniquement en JSON valide : {"subject":"...","body_text":"..."}.
Objectif : produire un email original, naturel, utile, moins générique, sans changer la mission du modèle.
Règles strictes :
- Ne jamais inventer d'avis, de prix, de délai, de certification, de promotion ou de résultat.
- Conserver les liens, URL, mentions de lien avis, coordonnées et informations importantes déjà présentes.
- Si une pièce jointe est fournie, s’appuyer sur son contenu lisible pour rendre l’email plus précis.
- Ne jamais inventer le contenu d’une pièce jointe : si le texte n’est pas lisible, utiliser seulement le nom/type du fichier et rester prudent.
- Ne pas copier mot pour mot le modèle : reformuler vraiment l'objet et le message.
- Respecter strictement l'instruction de langue prioritaire : la langue du modèle, de la demande ou des pièces jointes ne doit pas changer la langue finale demandée.
- Ne pas changer la finalité : avis, recommandation, offre, information, suivi ou enquête selon le modèle.
- Garder un email prêt à envoyer : salutation, message clair, CTA, formule de fin.
- Ne pas ajouter de markdown lourd ni de HTML. Texte brut uniquement.
${aiLanguageInstruction}
${aiRules}`;

    const input = `Module : ${templateModule}
Mission : ${mission}
Modèle choisi : ${templateTitle || "Non précisé"}
Catégorie : ${templateCategory || "Non précisé"}

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

${attachmentContext ? `Contexte des pièces jointes :\n${attachmentContext}\n` : "Aucune pièce jointe à analyser."}

Objet actuel du modèle :
${renderedSubject}

Message actuel du modèle :
${renderedBody}

Réécris un nouvel objet et un nouveau message, plus personnalisé et plus naturel, en respectant la même mission. Si une pièce jointe utile est présente, exploite ses informations pour rendre le mail plus concret sans la recopier.`;

    const generated = await openaiGenerateJSON<GeneratedTemplateMail>({
      system,
      input,
      maxOutputTokens: 1100,
      temperature: 0.82,
    });

    const subject = normalizeMailSubject(clean(generated.subject, 220) || renderedSubject);
    const bodyText = stripTemplateSignatureBlock(clean(generated.body_text, 6000) || renderedBody);

    return NextResponse.json({ subject, body_text: bodyText });
  } catch (e) {
    console.error("templates/generate-ai", e);
    return NextResponse.json({ error: "La génération IA n’a pas pu aboutir." }, { status: 500 });
  }
}
