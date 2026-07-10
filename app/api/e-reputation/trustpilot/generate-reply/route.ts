import { NextResponse } from "next/server";
import { bubbleAccessDisabledResponse, isAppBubbleEnabledForUser } from "@/lib/appBubbleAccessServer";
import { requireUser } from "@/lib/requireUser";
import { aiGenerateJSON } from "@/lib/aiGatewayClient";
import { enforceRateLimit } from "@/lib/rateLimit";
import { asRecord, asString } from "@/lib/tsSafe";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import {
  buildAiLanguageInstruction,
  getAiEngineTemperature,
  buildAiWritingProfilePromptSection,
  buildAiWritingProfileRules,
} from "@/lib/aiWritingProfile";
import { buildNormalizedAiGenerationProfile } from "@/lib/aiGenerationProfile";
import {
  commitAiCredits,
  computeReviewReplyAiCredits,
  reserveAiCredits,
  rollbackAiCredits,
  isAdminUserForAi,
  type AiCreditReservation,
} from "@/lib/aiUsageQuota";

export const maxDuration = 60;

const MAX_REVIEW_COMMENT_LENGTH = 2500;
const MAX_EXISTING_REPLY_LENGTH = 2500;
const MAX_REVIEWER_NAME_LENGTH = 120;
const MAX_REPLY_LENGTH = 4096;

type GeneratedReviewReply = {
  reply_text?: unknown;
  comment?: unknown;
};

function clean(value: unknown, max = 600) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trim();
}

function cleanReply(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[\'"“”‘’]+|[\'"“”‘’]+$/g, "")
    .trim()
    .slice(0, MAX_REPLY_LENGTH)
    .trim();
}

function normalizeRating(value: unknown) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return 0;
  return Math.min(5, Math.max(0, Math.round(rating)));
}

function listFrom(value: unknown, max = 8) {
  if (Array.isArray(value)) return value.map((item) => clean(item, 90)).filter(Boolean).slice(0, max);
  return clean(value, 700)
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

export async function POST(req: Request) {
  let quotaReservation: AiCreditReservation | null = null;
  try {
    const { supabase, authUserId, activeUserId, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    if (!(await isAppBubbleEnabledForUser(supabase, activeUserId, "trustpilot"))) {
      return bubbleAccessDisabledResponse("Trustpilot");
    }

    const body = asRecord(await req.json().catch(() => ({})) as unknown);
    const reviewName = clean(asString(body.reviewName), 180);
    const reviewerName = clean(body.reviewerName, MAX_REVIEWER_NAME_LENGTH) || "Client Trustpilot";
    const rating = normalizeRating(body.rating);
    const reviewComment = clean(body.comment, MAX_REVIEW_COMMENT_LENGTH);
    const existingReply = clean(body.existingReply, MAX_EXISTING_REPLY_LENGTH);

    if (!reviewName) {
      return NextResponse.json(
        { error: "Avis Trustpilot manquant.", user_message: "Avis Trustpilot manquant." },
        { status: 400 },
      );
    }

    const userId = activeUserId;
    const isAdmin = await isAdminUserForAi(supabase, authUserId);
    if (!isAdmin) {
      const rateLimited = await enforceRateLimit({
        name: "ereputation_trustpilot_review_reply_ai",
        identifier: authUserId,
        limit: 80,
        window: "1 d",
        failClosed: false,
      });
      if (rateLimited) return rateLimited;

      const quota = await reserveAiCredits({
        supabase,
        userId,
        action: "review_reply",
        credits: computeReviewReplyAiCredits({ rating, comment: reviewComment, existingReply }),
      });
      if (quota.errorResponse) return quota.errorResponse;
      quotaReservation = quota.reservation;
    }

    const [profileRes, businessRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("business_profiles")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const profile = asRecord(profileRes.data);
    const business = asRecord(businessRes.data);
    const generationProfile = buildNormalizedAiGenerationProfile({
      profile,
      business,
      idea: reviewComment || `Avis ${rating}/5`,
      theme: "trustpilot-review-reply",
      style: "review-reply",
    });
    const preferredEngine = generationProfile.preferences.engine;
    const businessContext = generationProfile.business;
    const profession = businessContext.professionLabel;
    const sectorLabel = businessContext.sectorLabel;
    const company = clean(businessContext.companyName, 160);
    const city = clean(businessContext.city, 80);
    const activityDescription = clean(businessContext.description, 800);
    const services = listFrom(businessContext.services, 10);
    const strengths = listFrom(businessContext.strengths, 8);
    const aiConfig = buildAiWritingProfilePromptSection(generationProfile);
    const aiRules = buildAiWritingProfileRules(generationProfile, preferredEngine);
    const aiLanguageInstruction = buildAiLanguageInstruction(generationProfile);

    const system = `Tu es l'assistant IA d'iNrCy spécialisé dans les réponses aux avis Trustpilot.
Réponds uniquement en JSON valide : {"reply_text":"..."}.
Objectif : proposer une réponse courte, humaine, professionnelle et prête à publier sur Trustpilot.
Règles strictes :
- Répondre au nom de l'entreprise, jamais au nom d'iNrCy.
- Ne jamais inventer de fait, prix, geste commercial, garantie, délai, certification ou promesse.
- Ne jamais divulguer d'information privée ou sensible.
- Si l'avis est négatif ou mitigé : rester calme, empathique, remercier, reconnaître le ressenti sans admettre une faute non établie, proposer un échange direct.
- Si l'avis est positif : remercier naturellement, valoriser l'équipe/le service sans surjouer.
- Si l'avis ne contient pas de commentaire écrit : produire une réponse simple adaptée à la note.
- Adapter clairement le ton selon la note : 5★ chaleureux et valorisant ; 4★ positif avec nuance ; 3★ neutre et ouvert ; 1–2★ empathique, calme et orienté résolution.
- Varier fortement les formulations d'un avis à l'autre.
- Pas de markdown, pas de HTML, pas de hashtag, pas de formule lourde.
- Une réponse Trustpilot doit rester concise et proportionnée à l'avis. Ne force pas un nombre fixe de phrases ni une structure répétitive.
- Respecter la Configuration IA du professionnel quand elle est compatible avec une réponse d'avis.
${aiLanguageInstruction}
${aiRules}`;

    const input = `Entreprise : ${company || "Non précisée"}
Ville : ${city || "Non précisée"}
Secteur : ${sectorLabel || "Non précisé"}
Métier : ${profession || "Non précisé"}
Description activité : ${activityDescription || "Non précisée"}
Prestations : ${services.length ? services.join(", ") : "Non précisées"}
Forces : ${strengths.length ? strengths.join(", ") : "Non précisées"}

Configuration IA :
${aiConfig || "- Non précisée"}

Instruction de langue prioritaire :
${aiLanguageInstruction}

Avis Trustpilot à traiter :
- Auteur : ${reviewerName}
- Note : ${rating || "Non précisée"}/5
- Commentaire : ${reviewComment || "Avis sans commentaire écrit."}
${existingReply ? `\nRéponse actuelle à améliorer/modifier :\n${existingReply}\n` : ""}

Génère une seule réponse prête à publier, naturelle, rassurante et adaptée à la note. Ne recopie pas mot pour mot l'avis.`;

    const generated = await aiGenerateJSON<GeneratedReviewReply>({
      feature: "reviews.trustpilot",
      accountId: userId,
      engine: preferredEngine,
      system,
      input,
      maxOutputTokens: 700,
      temperature: getAiEngineTemperature(generationProfile, preferredEngine, "reply"),
    });

    const replyText = cleanReply(generated?.reply_text || generated?.comment);
    if (!replyText) {
      await rollbackAiCredits(quotaReservation);
      return NextResponse.json(
        { error: "iNrCy n’a pas retourné de réponse exploitable.", user_message: "iNrCy n’a pas retourné de réponse exploitable." },
        { status: 500 },
      );
    }

    await commitAiCredits(quotaReservation);
    return NextResponse.json({ ok: true, reviewName, reply_text: replyText });
  } catch (error) {
    await rollbackAiCredits(quotaReservation);
    return jsonUserFacingError(error, {
      status: 500,
      fallback: "La génération IA n’a pas pu aboutir pour cet avis Trustpilot.",
    });
  }
}
