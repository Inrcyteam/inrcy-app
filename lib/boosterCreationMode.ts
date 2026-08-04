export type BoosterCreationMode = "ai" | "manual";

export type BoosterPublicationWorkflowSteps = {
  intention: number | null;
  content: number;
  media: number;
  preview: number;
};

export type BoosterCreationWorkflow = {
  mode: BoosterCreationMode;
  showsIntent: boolean;
  opensContentImmediately: boolean;
  generationEnabled: boolean;
  aiPreparationEnabled: boolean;
  mediaCanBeAddedAfterContent: true;
  steps: BoosterPublicationWorkflowSteps;
  path: readonly string[];
};

const AI_WORKFLOW: BoosterCreationWorkflow = Object.freeze({
  mode: "ai",
  showsIntent: true,
  opensContentImmediately: false,
  generationEnabled: true,
  aiPreparationEnabled: true,
  mediaCanBeAddedAfterContent: true,
  steps: Object.freeze({
    intention: 3,
    content: 4,
    media: 5,
    preview: 6,
  }),
  path: Object.freeze([
    "channels",
    "creation_mode",
    "intention_optional_media",
    "generation",
    "generated_content",
    "publication_media",
    "publication",
  ]),
});

const MANUAL_WORKFLOW: BoosterCreationWorkflow = Object.freeze({
  mode: "manual",
  showsIntent: false,
  opensContentImmediately: true,
  generationEnabled: false,
  aiPreparationEnabled: false,
  mediaCanBeAddedAfterContent: true,
  steps: Object.freeze({
    intention: null,
    content: 3,
    media: 4,
    preview: 5,
  }),
  path: Object.freeze([
    "channels",
    "creation_mode",
    "manual_channel_content",
    "publication_media",
    "publication",
  ]),
});

export function normalizeBoosterCreationMode(
  value: unknown,
): BoosterCreationMode | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "ai" || normalized === "manual") return normalized;
  return null;
}

function hasMeaningfulPostValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.some((entry) => String(entry || "").trim().length > 0);
  }
  return String(value || "").trim().length > 0;
}

export function hasBoosterChannelContent(value: unknown) {
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some((post) => {
    if (!post || typeof post !== "object") return false;
    const record = post as Record<string, unknown>;
    return [
      record.title,
      record.content,
      record.cta,
      record.ctaUrl,
      record.ctaPhone,
      record.hashtags,
    ].some(hasMeaningfulPostValue);
  });
}

export function inferBoosterCreationMode(input: {
  explicitMode?: unknown;
  idea?: unknown;
  publicationInstruction?: unknown;
  theme?: unknown;
  contentStyle?: unknown;
  postsByChannel?: unknown;
}): BoosterCreationMode | null {
  const explicitMode = normalizeBoosterCreationMode(input.explicitMode);
  if (explicitMode) return explicitMode;

  const hasAiBrief =
    String(input.idea || "").trim().length > 0 ||
    String(input.publicationInstruction || "").trim().length > 0 ||
    String(input.theme || "").trim().length > 0 ||
    (String(input.contentStyle || "equilibre").trim() || "equilibre") !==
      "equilibre";
  if (hasAiBrief) return "ai";

  if (hasBoosterChannelContent(input.postsByChannel)) return "manual";
  return null;
}

export function getBoosterCreationWorkflow(
  mode: BoosterCreationMode,
): BoosterCreationWorkflow {
  return mode === "ai" ? AI_WORKFLOW : MANUAL_WORKFLOW;
}

export function getBoosterPublicationWorkflowSteps(
  mode: BoosterCreationMode,
): BoosterPublicationWorkflowSteps {
  if (mode === "ai") {
    return {
      intention: 3,
      content: 4,
      media: 5,
      preview: 6,
    };
  }

  return {
    intention: null,
    content: 3,
    media: 4,
    preview: 5,
  };
}

export function shouldPrepareBoosterMediaForAi(input: {
  mode: BoosterCreationMode | null;
  mediaType: "images" | "video";
  hasImages: boolean;
  hasVideo: boolean;
  useImagesForAI: boolean;
}) {
  if (input.mode !== "ai") return false;
  if (input.mediaType === "video") return input.hasVideo;
  return input.hasImages && input.useImagesForAI;
}
