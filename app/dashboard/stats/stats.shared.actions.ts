import { type DecisionResult } from "@/lib/decision/decisionEngine";
import { type ActionKey, type CapturedLeads, type CubeKey, type CubeModel, type Overview } from "./stats.shared.types";
import { fmtInt, safeNum } from "./stats.shared.core";
import { computeOpportunity30, getGmbTotals, isIntentQuery, pageKind } from "./stats.shared.opportunity";
import { getSocialMetrics, isLinkedInStatsPartial } from "./stats.shared.quality";
import { hasTikTokStatsSignal, isTikTokStatsPermissionError, readMetricError } from "./stats.shared.metrics";

export function getDecisionInput(
  cubeKey: Exclude<CubeKey, "mails" | "inrbadge" | "inr_search">,
  ov: Overview,
  qualityScore: number,
  opp30: number,
  provenance: Array<{ label: string; value: number; colorVar: string }>,
  capturedLeads: CapturedLeads,
) {

  if (cubeKey === "facebook" || cubeKey === "instagram" || cubeKey === "linkedin" || cubeKey === "tiktok" || cubeKey === "youtube_shorts" || cubeKey === "pinterest") {
    const metrics = getSocialMetrics(cubeKey, ov);
    const connected =
      cubeKey === "facebook"
        ? !!ov?.sources?.facebook?.connected
        : cubeKey === "instagram"
          ? !!ov?.sources?.instagram?.connected
          : cubeKey === "tiktok"
          ? !!ov?.sources?.tiktok?.connected
          : cubeKey === "youtube_shorts"
            ? !!ov?.sources?.youtube_shorts?.connected
            : cubeKey === "pinterest"
              ? !!ov?.sources?.pinterest?.connected
              : !!ov?.sources?.linkedin?.connected;

    return {
      channelType: "social" as const,
      channelKey: cubeKey,
      connected,
      opportunities: opp30,
      quality: qualityScore,
      capturedLeads,
      metrics: {
        audience: metrics.audience,
        engagement: metrics.engagement,
        conversions: metrics.conversions,
        visibility: metrics.visibility,
      },
      provenance: provenance.map((entry) => ({ label: entry.label, value: entry.value })),
    };
  }

  if (cubeKey === "gmb") {
    const m = ov?.sources?.gmb?.metrics;
    const { impressions: visibility, websiteClicks, callClicks, directionRequests } = getGmbTotals(m);

    const conversions = websiteClicks + callClicks + directionRequests;

    return {
      channelType: "gmb" as const,
      channelKey: cubeKey,
      connected: !!ov?.sources?.gmb?.connected,
      opportunities: opp30,
      quality: qualityScore,
      capturedLeads,
      metrics: {
        traffic: conversions,
        conversions,
        visibility,
      },
      provenance: provenance.map((entry) => ({ label: entry.label, value: entry.value })),
    };
  }


  const queries = Array.isArray(ov.topQueries) ? ov.topQueries : [];
  const topPages = Array.isArray(ov.topPages) ? ov.topPages : [];
  const intentClicks = queries.filter((q) => isIntentQuery(q.query)).reduce((s, q) => s + safeNum(q.clicks), 0);
  const contactViews = topPages.filter((p) => pageKind(p.path) === "contact").reduce((s, p) => s + safeNum(p.views), 0);
  const traffic = safeNum(ov?.totals?.sessions);
  const visibility = safeNum(ov?.totals?.impressions);
  const engagement = Math.round((safeNum(ov?.totals?.engagementRate) || 0) * 100);

  return {
    channelType: "website" as const,
    channelKey: cubeKey,
    connected: cubeKey === "site_inrcy"
      ? !!ov?.sources?.site_inrcy?.connected?.ga4 || !!ov?.sources?.site_inrcy?.connected?.gsc
      : !!ov?.sources?.site_web?.connected?.ga4 || !!ov?.sources?.site_web?.connected?.gsc,
    opportunities: opp30,
    quality: qualityScore,
    capturedLeads,
    metrics: {
      traffic,
      intent: intentClicks,
      conversions: contactViews,
      engagement,
      visibility,
    },
    provenance: provenance.map((entry) => ({ label: entry.label, value: entry.value })),
  };
}


function boosterToolAction(detail: string): CubeModel["action"] {
  return {
    key: "booster_publier",
    title: "Booster",
    detail,
    href: "/dashboard?action=publish",
    pill: "Booster",
    effort: { level: "faible", label: "Effort faible • 5 min" },
  };
}

function propulserToolAction(detail: string): CubeModel["action"] {
  return {
    key: "propulser_action",
    title: "Propulser",
    detail,
    href: "/dashboard/propulser",
    pill: "Propulser",
    effort: { level: "moyen", label: "Effort moyen • 10-15 min" },
  };
}

function fideliserToolAction(detail: string): CubeModel["action"] {
  return {
    key: "fideliser_action",
    title: "Fidéliser",
    detail,
    href: "/dashboard/fideliser",
    pill: "Fidéliser",
    effort: { level: "moyen", label: "Effort moyen • 10-15 min" },
  };
}

export function actionFromDecision(baseAction: CubeModel["action"], decision: DecisionResult): CubeModel["action"] {

  const map: Record<DecisionResult["action"], CubeModel["action"]> = {
    publier: boosterToolAction(decision.reason),
    offrir: propulserToolAction(decision.reason),
    recolter: propulserToolAction(decision.reason),
    informer: fideliserToolAction(decision.reason),
    suivre: fideliserToolAction(decision.reason),
    enqueter: fideliserToolAction(decision.reason),
  };

  return { ...baseAction, ...map[decision.action] };
}

export function recommendAction(cubeKey: CubeKey, ov: Overview, qualityScore: number): CubeModel["action"] {
  if (cubeKey === "site_inrcy") {
    const ownership = ov?.inrcySiteOwnership;
    const c = ov?.sources?.site_inrcy?.connected;

    if (ownership === "none") {
      return {
        key: "connect",
        title: "Configurer",
        detail: "Aucun site iNrCy associé pour le moment.",
        href: "/dashboard?panel=site_inrcy",
        pill: "Connexion",
      };
    }

    if (!c?.ga4) {
      return {
        key: "connect",
        title: "Connecter GA4",
        detail: "Pour analyser vos visiteurs et leur comportement.",
        href: "/dashboard?panel=site_inrcy",
        pill: "Connexion",
      };
    }
    if (!c?.gsc) {
      return {
        key: "connect",
        title: "Connecter Google Search Console",
        detail: "Pour lire les intentions de recherche (mots-clés).",
        href: "/dashboard?panel=site_inrcy",
        pill: "Connexion",
      };
    }
  }

  if (cubeKey === "site_web") {
    const c = ov?.sources?.site_web?.connected;
    if (!c?.ga4) {
      return {
        key: "connect",
        title: "Connecter GA4",
        detail: "Pour analyser vos visiteurs et leur comportement.",
        href: "/dashboard?panel=site_web",
        pill: "Connexion",
      };
    }
    if (!c?.gsc) {
      return {
        key: "connect",
        title: "Connecter Google Search Console",
        detail: "Pour lire les intentions de recherche (mots-clés).",
        href: "/dashboard?panel=site_web",
        pill: "Connexion",
      };
    }
  }

  if (cubeKey === "gmb" && !ov?.sources?.gmb?.connected) {
    return {
      key: "connect",
      title: "Connecter Google Business",
      detail: "Pour capter les demandes locales (appels, itinéraires, clics site).",
      href: "/dashboard?panel=gmb",
      pill: "Connexion",
    };
  }

  if (cubeKey === "facebook" && !ov?.sources?.facebook?.connected) {
    return {
      key: "connect",
      title: "Connecter Facebook",
      detail: "Pour activer la visibilité sociale et la communauté.",
      href: "/dashboard?panel=facebook",
      pill: "Connexion",
    };
  }

  if (cubeKey === "instagram" && !ov?.sources?.instagram?.connected) {
    return {
      key: "connect",
      title: "Connecter Instagram",
      detail: "Pour activer la visibilité de votre marque.",
      href: "/dashboard?panel=instagram",
      pill: "Connexion",
    };
  }

  if (cubeKey === "linkedin" && !ov?.sources?.linkedin?.connected) {
    return {
      key: "connect",
      title: "Connecter LinkedIn",
      detail: "Pour activer la crédibilité.",
      href: "/dashboard?panel=linkedin",
      pill: "Connexion",
    };
  }

  if (cubeKey === "tiktok" && !ov?.sources?.tiktok?.connected) {
    return {
      key: "connect",
      title: "Connecter TikTok",
      detail: "Pour activer vos photos, vidéos et contenus courts.",
      href: "/dashboard?panel=tiktok",
      pill: "Connexion",
    };
  }

  if (cubeKey === "tiktok" && isTikTokStatsPermissionError(ov?.sources?.tiktok?.metrics)) {
    return {
      key: "connect",
      title: "Reconnecter TikTok",
      detail: "TikTok est connecté, mais les autorisations statistiques sont incomplètes. Reconnectez le canal pour autoriser les stats.",
      href: "/dashboard?panel=tiktok",
      pill: "Connexion",
    };
  }

  if (cubeKey === "youtube_shorts" && !ov?.sources?.youtube_shorts?.connected) {
    return {
      key: "connect",
      title: "Configurer YouTube",
      detail: "Pour activer votre canal vidéo.",
      href: "/dashboard?panel=youtube_shorts",
      pill: "Connexion",
    };
  }

  if (cubeKey === "pinterest" && !ov?.sources?.pinterest?.connected) {
    return {
      key: "connect",
      title: "Connecter Pinterest",
      detail: "Pour activer les épingles et la visibilité inspirationnelle.",
      href: "/dashboard?panel=pinterest",
      pill: "Connexion",
    };
  }

  const effortMap: Partial<Record<ActionKey, CubeModel["action"]["effort"] | undefined>> = {
    booster_publier: { level: "faible", label: "Effort faible • 5 min" },
    propulser_action: { level: "moyen", label: "Effort moyen • 10-15 min" },
    fideliser_action: { level: "moyen", label: "Effort moyen • 10-15 min" },
    booster_avis: { level: "moyen", label: "Effort moyen • 10 min" },
    booster_promotion: { level: "moyen", label: "Effort moyen • 15 min" },
    fideliser_informer: { level: "moyen", label: "Effort moyen • 15 min" },
    fideliser_satisfaction: { level: "faible", label: "Effort faible • 3 min" },
    fideliser_remercier: { level: "faible", label: "Effort faible • 2 min" },
    connect: undefined,
    loading: undefined,
  };

  const attachEffort = (a: CubeModel["action"]): CubeModel["action"] => {
    if (a.key === "connect") return a;
    return { ...a, effort: effortMap[a.key] };
  };

  const opp30 = computeOpportunity30(cubeKey, ov);

  if (cubeKey === "site_inrcy") {
    if (qualityScore >= 70) {
      return fideliserToolAction("Entretenez la relation avec vos clients satisfaits pour générer recommandations, avis et retours.");
    }
    return propulserToolAction("Lancez une action guidée pour mettre en avant une offre, une preuve ou une demande claire.");
  }

  if (cubeKey === "site_web") {
    if (qualityScore < 60) {
      return propulserToolAction("Lancez une action guidée pour renforcer le déclencheur commercial : offre, preuve ou demande d’avis.");
    }
    if (qualityScore >= 75 && opp30 > 4) {
      return fideliserToolAction("Créez un lien régulier avec vos contacts : information, suivi ou enquête.");
    }
    return boosterToolAction("Publiez une actualité locale pour relancer la visibilité et le trafic.");
  }

  if (cubeKey === "mails") {
    if (!ov?.sources?.mails?.connected) {
      return {
        key: "connect",
        title: "Configurer",
        detail: "Connectez une boîte d’envoi pour activer Fidéliser, Propulser et les mails simples.",
        href: "/dashboard?panel=mails",
        pill: "Connexion",
      };
    }
    return fideliserToolAction("Communiquez avec vos contacts depuis le canal Mails : information, suivi ou relance.");
  }

  if (cubeKey === "gmb") {
    const m = ov?.sources?.gmb?.metrics;
    const hasError = !!m?.error;
    if (hasError) {
      return boosterToolAction("Publiez 1 post Google Business pour activer le canal, même sans métriques détaillées.");
    }
    return propulserToolAction("Lancez une action Propulser : les avis et preuves de confiance sont le levier n°1 pour gagner des appels locaux.");
  }

  const socialLabel = cubeKey === "linkedin" ? "votre audience pro" : cubeKey === "pinterest" ? "votre audience inspiration" : (cubeKey === "tiktok" || cubeKey === "youtube_shorts") ? "votre audience vidéo" : "votre audience";
  return boosterToolAction(`1 publication simple/semaine suffit pour capter ${socialLabel}.`);
}

export function buildInsights(cubeKey: CubeKey, ov: Overview, qualityScore: number, decision?: DecisionResult) {
  const insights: string[] = [];

  if (cubeKey === "linkedin" && isLinkedInStatsPartial(ov)) {
    return [
      "Les données LinkedIn ne sont pas exploitables actuellement.",
      "Réessayez demain pour actualiser les statistiques détaillées.",
      "En attendant, publiez régulièrement pour entretenir votre visibilité professionnelle.",
    ];
  }

  if (cubeKey === "tiktok") {
    const connected = Boolean(ov?.sources?.tiktok?.connected);
    const metrics = ov?.sources?.tiktok?.metrics;
    const metricError = readMetricError(metrics);
    if (!connected) {
      return ["Canal TikTok non connecté.", "Connectez TikTok pour publier photos et vidéos depuis Booster."];
    }
    if (isTikTokStatsPermissionError(metrics)) {
      return [
        "Compte TikTok connecté, mais autorisations statistiques incomplètes.",
        "Reconnectez TikTok depuis Canaux pour autoriser la lecture des statistiques.",
        "La publication reste disponible depuis Booster pendant la mise à jour.",
      ];
    }
    if (metricError) {
      return [
        "Compte TikTok connecté.",
        "Les statistiques TikTok sont momentanément indisponibles, mais le canal reste prêt pour publier.",
        "Réactualisez iNrStats après vos prochaines publications publiques.",
      ];
    }
    if (!hasTikTokStatsSignal(metrics)) {
      return [
        "Compte TikTok connecté.",
        "Les premières statistiques seront enrichies dès que TikTok remontera des données publiques.",
        "Publiez une photo ou une vidéo depuis Booster pour activer le suivi.",
      ];
    }
  }

  if (decision) {
    const tool = decision.action === "publier"
      ? "Booster"
      : decision.action === "offrir" || decision.action === "recolter"
        ? "Propulser"
        : "Fidéliser";
    const toolLine = tool === "Booster"
      ? "Recommandation : utiliser Booster pour publier et activer le canal."
      : tool === "Propulser"
        ? "Recommandation : utiliser Propulser pour choisir une action business adaptée."
        : "Recommandation : utiliser Fidéliser pour entretenir et convertir la relation client.";
    return [toolLine, decision.reason].filter(Boolean).slice(0, 3);
  }

  if (cubeKey === "mails") {
    if (!ov?.sources?.mails?.connected) {
      return ["Canal mail non connecté.", "Connectez une boîte d’envoi pour activer Fidéliser, Propulser et les mails simples."];
    }
    const m = ov?.sources?.mails?.metrics;
    return [
      `Boîtes connectées : ${fmtInt(safeNum(m?.connectedCount))}/4.`,
      `${fmtInt(safeNum(m?.contactsCrm))} contacts CRM exploitables pour vos campagnes.`,
      safeNum(m?.campagnes30) > 0 ? "Des campagnes sont déjà visibles sur les 30 derniers jours." : "Canal prêt : lancez une première campagne Fidéliser ou Propulser.",
    ];
  }

  if (cubeKey === "facebook") {
    if (!ov?.sources?.facebook?.connected) {
      return ["Canal non connecté : aucune lecture possible.", "Connectez Facebook pour activer la visibilité sociale."];
    }
    return ["Canal social prêt à être activé.", "Misez sur la régularité plutôt que sur le volume."];
  }

  if (cubeKey === "tiktok") {
    if (!ov?.sources?.tiktok?.connected) {
      return ["Canal non connecté : aucune lecture possible.", "Connectez TikTok pour préparer vos publications photos et vidéos."];
    }
    return ["TikTok est connecté et mesurable.", "Publiez régulièrement des photos ou vidéos courtes pour développer votre audience."];
  }

  if (cubeKey === "youtube_shorts") {
    if (!ov?.sources?.youtube_shorts?.connected) {
      return ["Canal YouTube non connecté.", "Configurez votre chaîne pour préparer vos publications vidéo."];
    }
    return ["YouTube est connecté.", "Publiez régulièrement des vidéos courtes ou longues pour développer votre audience."];
  }

  if (cubeKey === "gmb") {
    if (!ov?.sources?.gmb?.connected) {
      return ["Canal local non connecté.", "Google Business est souvent le meilleur levier d’appels locaux."];
    }
    if (ov?.sources?.gmb?.metrics?.error) {
      return ["Connexion OK, métriques détaillées indisponibles.", "On peut quand même agir : posts + avis."];
    }
    return ["Présence locale active.", "Les avis + des posts réguliers maximisent les demandes."];
  }

  const t = ov.totals || ({} as any);
  const sessions = safeNum(t.sessions);
  const queries = Array.isArray(ov.topQueries) ? ov.topQueries : [];
  const intentClicks = queries.filter((q) => isIntentQuery(q.query)).reduce((s, q) => s + safeNum(q.clicks), 0);
  const anyIntent = intentClicks > 0;

  if (sessions <= 20) insights.push("Trafic faible sur la période : opportunité d’activation rapide.");
  else insights.push("Trafic présent : on peut optimiser la conversion.");

  if (anyIntent) insights.push("Des recherches à intention business existent (devis, urgence, prix…).");
  else insights.push("Peu d’intention business détectée : il faut clarifier l’offre et la zone.");

  if (qualityScore >= 75) insights.push("Structure solide : vous êtes prêt à capter des demandes.");
  else if (qualityScore >= 55) insights.push("Structure correcte : quelques ajustements peuvent booster les demandes.");
  else insights.push("Structure à renforcer : il manque des déclencheurs de contact.");

  return insights.slice(0, 3);
}
