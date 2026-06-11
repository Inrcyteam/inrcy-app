import { NextResponse } from "next/server";
import { resolveInrAgentActionRequest } from "@/lib/inrAgentRequest";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  computeBoosterAiCredits,
  consumeAiCredits,
  isAdminUserForAi,
} from "@/lib/aiUsageQuota";
import { openaiGenerateJSON } from "@/lib/openaiClient";
import {
  boosterSystemPrompt,
  boosterUserPrompt,
  pickBoosterHiddenAngle,
  type BoosterChannels,
  type BoosterRecentPublication,
  type BoosterStyle,
  type BoosterTheme,
} from "@/lib/boosterPrompt";
import { sanitizeGmbGeneratedPost } from "@/lib/googleBusinessCompliance";
import {
  sanitizeBoosterSiteText,
  stripSiteTextFormatting,
} from "@/lib/boosterFormatting";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";
import { decodeBusinessSector } from "@/lib/activitySectors";
import { getJobLabel } from "@/lib/activityCatalog";
import {
  sanitizeInrAgentAutomationSettings,
  type InrAgentAutomationSettings,
  type InrAgentChannel,
  type InrAgentTheme,
  type InrAgentValidationMode,
} from "@/lib/inrAgentSettings";
import { rowToInrAgentAction } from "@/lib/inrAgentActions";

export const maxDuration = 120;
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type ChannelPost = {
  title: string;
  content: string;
  cta: string;
  hashtags: string[];
};

type BoosterGenResponse = {
  versions?: Partial<Record<BoosterChannels, Partial<ChannelPost>>>;
};

type ImageBankAsset = {
  id: string;
  bucket: string;
  storagePath: string;
  url: string;
  title: string;
  sector: string;
  job: string;
  tags: string[];
  orientation: string;
  source: string;
};

type AutomationDbRow = {
  enabled?: boolean | null;
  frequency?: string | null;
  day_of_week?: number | null;
  time?: string | null;
  validation_mode?: string | null;
  allowed_channels?: string[] | null;
  allowed_themes?: string[] | null;
  use_image_bank?: boolean | null;
  image_required?: boolean | null;
  recipient_scope?: string | null;
  source_strategy?: string | null;
  last_prepared_at?: string | null;
  last_executed_at?: string | null;
  next_run_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

const BUCKET = "inrcy-image-bank";

const agentToBoosterChannel: Partial<Record<InrAgentChannel, BoosterChannels>> = {
  site_inrcy: "inrcy_site",
  site_web: "site_web",
  gmb: "gmb",
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
  tiktok: "tiktok",
  youtube: "youtube_shorts",
};

const boosterToAgentChannel: Record<BoosterChannels, string> = {
  inrcy_site: "site_inrcy",
  site_web: "site_web",
  gmb: "gmb",
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
  tiktok: "tiktok",
  youtube_shorts: "youtube_shorts",
};

const agentThemeToBoosterTheme: Partial<Record<InrAgentTheme, BoosterTheme>> = {
  conseils: "conseil",
  realisations: "realisation",
  offres: "promotion",
  actualites: "actualite",
};

const themeLabels: Partial<Record<InrAgentTheme, string>> = {
  conseils: "Conseil",
  realisations: "Réalisation",
  offres: "Offre",
  actualites: "Actualité",
};

const channelLabels: Record<string, string> = {
  site_inrcy: "Site iNrCy",
  site_web: "Site web",
  gmb: "Google Business",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
};

const siteChannels = new Set<BoosterChannels>(["inrcy_site", "site_web"]);
const allowedBoosterChannels = new Set<BoosterChannels>([
  "inrcy_site",
  "site_web",
  "gmb",
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  // YouTube Shorts nécessite une vidéo : iNr’Agent Publier V1 prépare uniquement image + texte.
  // Le canal sera réactivé ici quand la préparation vidéo sera branchée.
]);

function rowToAutomationSettings(row: AutomationDbRow | null): InrAgentAutomationSettings {
  return sanitizeInrAgentAutomationSettings("publish", {
    enabled: row?.enabled ?? undefined,
    frequency: row?.frequency as InrAgentAutomationSettings["frequency"],
    dayOfWeek: row?.day_of_week ?? undefined,
    time: row?.time ?? undefined,
    validationMode: row?.validation_mode as InrAgentAutomationSettings["validationMode"],
    allowedChannels: row?.allowed_channels as InrAgentAutomationSettings["allowedChannels"],
    allowedThemes: row?.allowed_themes as InrAgentAutomationSettings["allowedThemes"],
    useImageBank: row?.use_image_bank ?? undefined,
    imageRequired: row?.image_required ?? undefined,
    recipientScope: row?.recipient_scope as InrAgentAutomationSettings["recipientScope"],
    sourceStrategy: row?.source_strategy as InrAgentAutomationSettings["sourceStrategy"],
    lastPreparedAt: row?.last_prepared_at ?? null,
    lastExecutedAt: row?.last_executed_at ?? null,
    nextRunAt: row?.next_run_at ?? null,
    metadata: row?.metadata ?? {},
  });
}

function cleanText(value: unknown, maxLength = 220) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanList(value: unknown, maxItems = 8, maxItemLength = 80) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/[,;\n]/)
        .map((item) => item.trim());

  return Array.from(
    new Set(
      rawItems.map((item) => cleanText(item, maxItemLength)).filter(Boolean),
    ),
  ).slice(0, maxItems);
}

function cleanRecentPublicationField(value: unknown, maxLength: number) {
  return cleanText(value, maxLength);
}

async function fetchRecentPublicationMemory(
  supabase: { from: (table: string) => any },
  userId: string,
): Promise<BoosterRecentPublication[]> {
  try {
    const { data, error } = await supabase
      .from("publications")
      .select("title,content,cta,idea,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error || !Array.isArray(data)) return [];

    return data
      .map((row: any) => ({
        title: cleanRecentPublicationField(row?.title, 90),
        content: cleanRecentPublicationField(row?.content, 260),
        cta: cleanRecentPublicationField(row?.cta, 90),
        idea: cleanRecentPublicationField(row?.idea, 140),
        created_at: cleanRecentPublicationField(row?.created_at, 40),
      }))
      .filter((row: BoosterRecentPublication) => row.title || row.content || row.idea || row.cta);
  } catch {
    return [];
  }
}

function chooseTheme(allowedThemes: InrAgentTheme[]): InrAgentTheme {
  const publishThemes = allowedThemes.filter((theme) => Boolean(agentThemeToBoosterTheme[theme]));
  if (!publishThemes.length) return "conseils";
  return publishThemes[Math.floor(Math.random() * publishThemes.length)] ?? "conseils";
}

function getBusinessProfession(business: JsonRecord | null) {
  const decoded = decodeBusinessSector(String(business?.sector || ""));
  const professionLabel =
    getJobLabel(decoded.sectorCategory, decoded.profession) || decoded.profession;
  return {
    sector: decoded.sectorCategory,
    profession: decoded.profession,
    professionLabel,
  };
}

function buildAgentIdea(args: {
  business: JsonRecord | null;
  profile: JsonRecord | null;
  theme: InrAgentTheme;
}) {
  const { sector, professionLabel } = getBusinessProfession(args.business);
  const company = cleanText(
    args.profile?.company_legal_name || args.profile?.companyLegalName || "",
    90,
  );
  const city = cleanText(args.profile?.hq_city || args.profile?.hqCity || "", 80);
  const services = cleanList(
    args.business?.services || args.business?.services_text,
    5,
    70,
  );
  const zones = cleanList(
    args.business?.intervention_zones || args.business?.intervention_zones_text,
    4,
    70,
  );
  const themeLabel = themeLabels[args.theme] || "Conseil";
  const servicesText = services.length ? ` autour de ${services.join(", ")}` : "";
  const cityText = city ? ` à ${city}` : "";
  const zonesText = zones.length ? ` et ses environs (${zones.join(", ")})` : "";
  const companyText = company ? ` pour ${company}` : "";

  if (args.theme === "realisations") {
    return `Préparer une publication de type réalisation${companyText} : mettre en avant le sérieux, la méthode et le soin apporté par un professionnel ${professionLabel || sector}${servicesText}${cityText}${zonesText}, sans inventer de faux chantier ni de faux client.`;
  }

  if (args.theme === "offres") {
    return `Préparer une publication commerciale douce${companyText} : valoriser une prestation utile d'un professionnel ${professionLabel || sector}${servicesText}${cityText}${zonesText}, avec un appel à l'action naturel, sans inventer de remise, de prix ou de promesse.`;
  }

  if (args.theme === "actualites") {
    return `Préparer une publication d'actualité locale${companyText} pour un professionnel ${professionLabel || sector}${servicesText}${cityText}${zonesText} : parler d'un sujet utile ou saisonnier en lien avec l'activité, sans inventer d'événement précis.`;
  }

  return `Préparer une publication de conseil utile${companyText} pour un professionnel ${professionLabel || sector}${servicesText}${cityText}${zonesText} : donner une astuce simple, concrète et rassurante en lien avec le métier, sans inventer de détail non fourni.`;
}

function cleanHashtags(channel: BoosterChannels, input: unknown) {
  if (channel === "gmb" || siteChannels.has(channel)) return [];
  const limit =
    channel === "instagram" || channel === "tiktok" || channel === "youtube_shorts"
      ? 8
      : channel === "linkedin"
        ? 3
        : 2;
  return Array.isArray(input)
    ? input
        .map((h) =>
          String(h || "")
            .trim()
            .replace(/^#+/, ""),
        )
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

function normalizePost(
  channel: BoosterChannels,
  raw: Partial<ChannelPost> | undefined,
): ChannelPost {
  if (channel === "gmb") {
    const safe = sanitizeGmbGeneratedPost({
      title: String(raw?.title || ""),
      content: String(raw?.content || ""),
      cta: String(raw?.cta || ""),
      hashtags: [],
    });
    return {
      title: safe.title,
      content: safe.content.slice(0, 2000),
      cta: safe.cta,
      hashtags: [],
    };
  }

  const siteChannel = siteChannels.has(channel);
  const title = String(raw?.title || "").trim();
  const content = String(raw?.content || "").trim();

  return {
    title: (siteChannel
      ? sanitizeBoosterSiteText(title)
      : stripSiteTextFormatting(title)
    ).slice(0, 90),
    content: (siteChannel
      ? sanitizeBoosterSiteText(content)
      : stripSiteTextFormatting(content)
    ).slice(0, siteChannel ? 6000 : 2000),
    cta: stripSiteTextFormatting(raw?.cta || "").slice(0, 180),
    hashtags: cleanHashtags(channel, raw?.hashtags),
  };
}

function hasUsefulContent(post: ChannelPost | undefined) {
  return Boolean(post?.title?.trim() && post?.content?.trim() && post?.cta?.trim());
}

async function generateBoosterPosts(args: {
  idea: string;
  theme: BoosterTheme;
  channels: BoosterChannels[];
  profile: JsonRecord | null;
  business: JsonRecord | null;
  recentPublications: BoosterRecentPublication[];
}) {
  const out = await openaiGenerateJSON<BoosterGenResponse>({
    system: boosterSystemPrompt(),
    input: boosterUserPrompt({
      idea: args.idea,
      theme: args.theme,
      style: "equilibre" as BoosterStyle,
      channels: args.channels,
      profile: args.profile,
      business: args.business,
      hiddenAngle: pickBoosterHiddenAngle(),
      recentPublications: args.recentPublications,
    }),
    maxOutputTokens: args.channels.some((channel) => siteChannels.has(channel)) ? 5600 : 3600,
    temperature: 0.78,
  });

  const rawVersions =
    out?.versions && typeof out.versions === "object" ? out.versions : {};
  const versions: Partial<Record<BoosterChannels, ChannelPost>> = {};

  for (const channel of args.channels) {
    versions[channel] = normalizePost(channel, rawVersions[channel]);
  }

  return versions;
}

async function selectConnectedChannels(args: {
  supabase: { from: (table: string) => any };
  userId: string;
  automation: InrAgentAutomationSettings;
}): Promise<BoosterChannels[]> {
  const states = await getChannelConnectionStates(args.supabase, args.userId);

  const isAllowedBoosterChannel = (
    channel: BoosterChannels | undefined,
  ): channel is BoosterChannels => {
    return channel !== undefined && allowedBoosterChannels.has(channel);
  };

  const allowedChannels = args.automation.allowedChannels
    .map((channel) => agentToBoosterChannel[channel])
    .filter(isAllowedBoosterChannel);

  const connected: Record<BoosterChannels, boolean> = {
    inrcy_site: states.site_inrcy.connected,
    site_web: states.site_web.connected,
    gmb: states.gmb.connected && !states.gmb.requiresUpdate,
    facebook: states.facebook.connected && !states.facebook.requiresUpdate,
    instagram: states.instagram.connected && !states.instagram.requiresUpdate,
    linkedin: states.linkedin.connected && !states.linkedin.requiresUpdate,
    tiktok: states.tiktok.connected && !states.tiktok.requiresUpdate,
    youtube_shorts:
      states.youtube_shorts.connected && !states.youtube_shorts.requiresUpdate,
  };

  const uniqueChannels: BoosterChannels[] = Array.from(new Set<BoosterChannels>(allowedChannels));
  return uniqueChannels.filter((channel) => connected[channel]);
}

async function loadPublishAutomationSettings(userId: string) {
  const { data } = await supabaseAdmin
    .from("inr_agent_automation_settings")
    .select(
      "enabled, frequency, day_of_week, time, validation_mode, allowed_channels, allowed_themes, use_image_bank, image_required, recipient_scope, source_strategy, last_prepared_at, last_executed_at, next_run_at, metadata",
    )
    .eq("user_id", userId)
    .eq("automation_key", "publish")
    .maybeSingle();

  return rowToAutomationSettings((data as AutomationDbRow | null) ?? null);
}

async function pickImageFromBank(args: {
  business: JsonRecord | null;
  theme: InrAgentTheme;
}): Promise<ImageBankAsset | null> {
  const { sector, profession, professionLabel } = getBusinessProfession(args.business);
  const tags = [args.theme, profession, professionLabel, sector]
    .map((item) => cleanText(item, 80).toLowerCase())
    .filter(Boolean);

  async function sign(row: any): Promise<ImageBankAsset | null> {
    if (!row?.storage_path) return null;
    const signed = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(String(row.storage_path), 60 * 60);

    return {
      id: String(row.id || ""),
      bucket: BUCKET,
      storagePath: String(row.storage_path || ""),
      url: signed.data?.signedUrl || "",
      title: cleanText(row.title, 180),
      sector: cleanText(row.sector, 80),
      job: cleanText(row.job, 80),
      tags: Array.isArray(row.tags) ? row.tags.map((tag: unknown) => cleanText(tag, 60)).filter(Boolean) : [],
      orientation: cleanText(row.orientation, 40),
      source: cleanText(row.source, 80),
    };
  }

  try {
    const select = "id,storage_path,title,sector,job,tags,orientation,source,usage_count,created_at";

    if (profession) {
      const { data } = await supabaseAdmin
        .from("inrcy_image_bank")
        .select(select)
        .eq("is_active", true)
        .eq("job", profession)
        .order("usage_count", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(8);

      const rows = Array.isArray(data) ? data : [];
      if (rows.length) return sign(rows[Math.floor(Math.random() * rows.length)]);
    }

    if (sector) {
      const { data } = await supabaseAdmin
        .from("inrcy_image_bank")
        .select(select)
        .eq("is_active", true)
        .eq("sector", sector)
        .order("usage_count", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(12);

      const rows = Array.isArray(data) ? data : [];
      if (rows.length) return sign(rows[Math.floor(Math.random() * rows.length)]);
    }

    if (tags.length) {
      const q = tags[0].replaceAll(",", " ");
      const { data } = await supabaseAdmin
        .from("inrcy_image_bank")
        .select(select)
        .eq("is_active", true)
        .or(`title.ilike.%${q}%,job.ilike.%${q}%,sector.ilike.%${q}%`)
        .order("usage_count", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(8);

      const rows = Array.isArray(data) ? data : [];
      if (rows.length) return sign(rows[Math.floor(Math.random() * rows.length)]);
    }

    const { data } = await supabaseAdmin
      .from("inrcy_image_bank")
      .select(select)
      .eq("is_active", true)
      .order("usage_count", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(16);

    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) return null;
    return sign(rows[Math.floor(Math.random() * rows.length)]);
  } catch {
    return null;
  }
}

function getExecutionPolicy(validationMode: InrAgentValidationMode) {
  if (validationMode === "draft_only") return "draft_only";
  return "manual_validation";
}

function getInitialStatus(validationMode: InrAgentValidationMode) {
  return validationMode === "draft_only" ? "draft" : "pending_validation";
}

function buildPreviewText(versions: Partial<Record<BoosterChannels, ChannelPost>>) {
  const preferredOrder: BoosterChannels[] = [
    "facebook",
    "instagram",
    "gmb",
    "linkedin",
    "inrcy_site",
    "site_web",
    "tiktok",
    "youtube_shorts",
  ];
  const first = preferredOrder.map((channel) => versions[channel]).find(hasUsefulContent);
  if (!first) return "";
  return [first.title, first.content, first.cta].filter(Boolean).join("\n\n");
}

function buildSummary(channels: BoosterChannels[], image: ImageBankAsset | null) {
  const labels = channels
    .map((channel) => channelLabels[boosterToAgentChannel[channel]] || channel)
    .join(", ");
  return `Publication préparée pour ${labels}.${image ? " Visuel iNrCy ajouté depuis la banque d’images." : " Aucun visuel disponible dans la banque d’images pour le moment."}`;
}

export async function POST(request: Request) {
  const context = await resolveInrAgentActionRequest(request);
  if (context.errorResponse) return context.errorResponse;

  const { supabase, userId, isCron } = context;
  const isAdmin = await isAdminUserForAi(supabase, userId);

  if (!isAdmin) {
    const rl = await enforceRateLimit({
      name: "inr_agent_prepare_publish",
      identifier: userId,
      limit: 4,
      window: "1 m",
    });
    if (rl) return rl;
  }

  const automation = await loadPublishAutomationSettings(userId);
  if (!automation.enabled) {
    return NextResponse.json(
      { error: "L’automatisation Publier régulièrement est désactivée." },
      { status: 400 },
    );
  }

  const channels = await selectConnectedChannels({ supabase, userId, automation });
  if (!channels.length) {
    return NextResponse.json(
      {
        error:
          "Aucun canal Booster / Publier connecté et autorisé pour iNr’Agent.",
      },
      { status: 400 },
    );
  }

  if (!isAdmin) {
    const quotaLimited = await consumeAiCredits({
      supabase,
      userId,
      action: "booster",
      credits: computeBoosterAiCredits({ mediaType: "images" }),
    });
    if (quotaLimited) return quotaLimited;
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const profile = profileData && typeof profileData === "object" ? (profileData as JsonRecord) : null;

  let business: JsonRecord | null = null;
  try {
    const { data } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    business = data && typeof data === "object" ? (data as JsonRecord) : null;
  } catch {
    business = null;
  }

  const agentTheme = chooseTheme(automation.allowedThemes);
  const boosterTheme = agentThemeToBoosterTheme[agentTheme] || "conseil";
  const idea = buildAgentIdea({ business, profile, theme: agentTheme });
  const recentPublications = await fetchRecentPublicationMemory(supabase, userId);
  const image = automation.useImageBank
    ? await pickImageFromBank({ business, theme: agentTheme })
    : null;

  if (automation.imageRequired && !image) {
    return NextResponse.json(
      {
        error:
          "Aucune image active n’est disponible dans la banque d’images iNrCy. Ajoute au moins une image ou désactive l’obligation d’image.",
      },
      { status: 400 },
    );
  }

  const versions = await generateBoosterPosts({
    idea,
    theme: boosterTheme,
    channels,
    profile,
    business,
    recentPublications,
  });

  const missingChannels = channels.filter((channel) => !hasUsefulContent(versions[channel]));
  if (missingChannels.length) {
    return NextResponse.json(
      {
        error:
          "iNr’Agent n’a pas réussi à préparer un contenu complet pour tous les canaux. Relance la préparation.",
      },
      { status: 502 },
    );
  }

  const now = new Date().toISOString();
  const targetChannels = channels.map((channel) => boosterToAgentChannel[channel]);
  const previewText = buildPreviewText(versions);
  const title = `Publication ${themeLabels[agentTheme] || "iNr’Agent"} prête`;
  const payload = {
    version: 1,
    source: "inr_agent_publish_preparer",
    idea,
    theme: agentTheme,
    boosterTheme,
    postByChannel: versions,
    selectedChannels: channels,
    targetChannels,
    image,
    imageAsset: image,
    executionTarget: "booster_publish",
  };

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("inr_agent_actions")
    .insert({
      user_id: userId,
      automation_key: "publish",
      action_type: "publication",
      target_tool: "booster",
      title,
      summary: buildSummary(channels, image),
      preview_text: previewText,
      target_channels: targetChannels,
      target_themes: [agentTheme],
      recipients: [],
      image_assets: image ? [image] : [],
      payload,
      validation_required: automation.validationMode !== "draft_only",
      execution_policy: getExecutionPolicy(automation.validationMode),
      status: getInitialStatus(automation.validationMode),
      scheduled_for: null,
      prepared_at: now,
      metadata: {
        automationFrequency: automation.frequency,
        preparedManually: !isCron,
        preparedByCron: isCron,
      },
      created_at: now,
      updated_at: now,
    })
    .select(
      "id, automation_key, action_type, target_tool, title, summary, preview_text, target_channels, target_themes, recipients, image_assets, payload, validation_required, execution_policy, status, scheduled_for, prepared_at, validated_at, refused_at, completed_at, last_error, created_at, updated_at",
    )
    .single();

  if (insertError) {
    return NextResponse.json(
      {
        error: "Impossible d’enregistrer l’action préparée iNr’Agent.",
        detail: insertError.message,
      },
      { status: 500 },
    );
  }

  await supabaseAdmin
    .from("inr_agent_automation_settings")
    .update({ last_prepared_at: now, updated_at: now })
    .eq("user_id", userId)
    .eq("automation_key", "publish");

  if (image?.id) {
    try {
      const { data: usageRow } = await supabaseAdmin
        .from("inrcy_image_bank")
        .select("usage_count")
        .eq("id", image.id)
        .maybeSingle();
      const nextUsageCount = Number((usageRow as { usage_count?: unknown } | null)?.usage_count || 0) + 1;
      await supabaseAdmin
        .from("inrcy_image_bank")
        .update({ usage_count: nextUsageCount, updated_at: now })
        .eq("id", image.id);
    } catch {
      // Non bloquant : la publication préparée reste valide même si le compteur image n'est pas mis à jour.
    }
  }

  return NextResponse.json({
    action: rowToInrAgentAction(inserted as any),
    prepared: true,
  });
}
