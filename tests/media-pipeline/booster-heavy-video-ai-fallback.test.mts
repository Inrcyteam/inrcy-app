import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("une grosse vidéo uploadée reste un contexte IA utilisable sans captures", () => {
  const source = read("lib/mediaWorkspaceConsumption.ts");
  const start = source.indexOf("async function resolveWorkspaceAiVideoFamily");
  const end = source.indexOf(
    "export async function resolveWorkspaceAiConsumption",
    start,
  );
  const resolver = source.slice(start, end);

  assert.match(resolver, /const videoReference = preview \|\| \{/);
  assert.match(resolver, /storagePath: item\.sourceStoragePath/);
  assert.match(resolver, /pickAllReadyVariants\([\s\S]*"thumbnail"\)/);
  assert.match(resolver, /pickAllReadyVariants\([\s\S]*"ai_preview"\)/);
  assert.match(resolver, /Promise\.allSettled\([\s\S]*variantToDataUrl/);
  assert.match(resolver, /workspace_video_frames_pending/);
  assert.match(resolver, /state: "partial"/);
  assert.match(resolver, /visualFrames,/);
  assert.doesNotMatch(
    resolver,
    /throw new MediaWorkspaceConsumptionError\([\s\S]{0,160}captures IA/,
  );
  assert.doesNotMatch(resolver, /downloadWorkspaceVideoSource|\.download\(item\.sourceStoragePath/);
});

test("Générer lance une seule préparation serveur et partage une grâce totale de 12 secondes", () => {
  const modal = read("app/dashboard/booster/publier/PublishModal.tsx");
  const generationStart = modal.indexOf("const onGenerate = async");
  const generationEnd = modal.indexOf(
    "const onDuplicateContentToAllChannels",
    generationStart,
  );
  const generation = modal.slice(generationStart, generationEnd);

  assert.match(
    modal,
    /prepareAiMedia: startPersistentAiMediaPreparation/,
  );
  assert.match(
    generation,
    /startPersistentAiMediaPreparation\(\)[\s\S]*Promise\.race\(/,
  );
  assert.match(
    generation,
    /BOOSTER_VIDEO_AI_PREPARATION_GRACE_MS/,
  );
  assert.match(
    modal,
    /BOOSTER_VIDEO_AI_PREPARATION_GRACE_MS = 12_000/,
  );
  assert.doesNotMatch(
    generation,
    /while\s*\([^)]*\)[\s\S]*startPersistentAiMediaPreparation\(\)/,
  );
  assert.match(
    generation,
    /captures finalisées en arrière-plan/,
  );
  assert.match(
    generation,
    /Date\.now\(\) \+ BOOSTER_GENERATION_SAFETY_BUDGET_MS/,
  );
});

test("l'insertion d'une vidéo IA préchauffe les captures, jamais le mode manuel", () => {
  const uploadRoute = read("app/api/media-pipeline/upload-event/route.ts");
  const hook = read(
    "app/dashboard/booster/publier/usePersistentMediaWorkspace.ts",
  );

  assert.match(
    uploadRoute,
    /workspaceAiSource[\s\S]*metadata\.creation_mode[\s\S]*=== "ai"/,
  );
  assert.match(
    uploadRoute,
    /current\.data\.media_type === "video"[\s\S]*sourceMetadataOnly[\s\S]*mission: "ai_preparation"/,
  );
  assert.match(
    uploadRoute,
    /if \(!workspaceAiSource\)[\s\S]*reason: "workspace_source_ready"/,
  );
  assert.match(hook, /if \(!enabled \|\| creationMode !== "ai"\) return/);
  assert.match(hook, /void prepareAiMedia\(\)\.catch/);
  assert.doesNotMatch(hook, /uploadUniversalMediaFile\([^)]*ai_preparation/);
});

test("toute panne média devient un diagnostic orange sans bloquer les textes", () => {
  const route = read("app/api/booster/generate/route.ts");
  const modal = read("app/dashboard/booster/publier/PublishModal.tsx");
  const intentPanel = read(
    "app/dashboard/booster/publier/components/PublishIntentPanel.tsx",
  );
  const strictStart = route.indexOf("const workspaceHasUsableFamily");
  const strictEnd = route.indexOf("const degradedFamilies", strictStart);
  const strictFallback = route.slice(strictStart, strictEnd);
  const catchStart = route.indexOf("} catch (workspaceError)");
  const catchEnd = route.indexOf("const imagesForAI", catchStart);
  const catchFallback = route.slice(catchStart, catchEnd);

  assert.match(route, /withinMediaContextBudget\(/);
  assert.match(route, /buildMediaAnalysisFallback\(/);
  assert.match(route, /mediaAnalysisFallback \? \{ mediaAnalysisFallback \}/);
  assert.doesNotMatch(strictFallback, /return NextResponse\.json/);
  assert.doesNotMatch(catchFallback, /return NextResponse\.json/);
  assert.match(
    modal,
    /media workspace unavailable, text fallback[\s\S]*readyMediaWorkspaceId = null/,
  );
  assert.match(
    modal,
    /mediaWorkspaceExpected:[\s\S]*Boolean\(readyMediaWorkspaceId\)/,
  );
  assert.match(modal, /json\?\.mediaAnalysisFallback/);
  assert.match(
    modal,
    /setPostsByChannel\(sanitizePostsForEditor\(versions\)\);[\s\S]*setContentWorkspaceOpen\(true\);[\s\S]*scrollToContentWorkspace\(\);[\s\S]*setGenerationMediaWarning\(/,
    "un repli d'analyse média ne doit jamais empêcher le défilement vers les contenus générés",
  );
  assert.match(
    modal,
    /imgError=\{generationMediaWarning \? "" : imgError\}/,
  );
  assert.match(intentPanel, /generationMediaWarning/);
  assert.match(intentPanel, /rgba\(251, 146, 60, 0\.10\)/);
  assert.match(
    route,
    /Analyse visuelle indisponible : contenus générés à partir de votre phrase et de votre profil/,
  );
});

test("la route de génération sait rédiger sans capture ni audio", () => {
  const route = read("app/api/booster/generate/route.ts");
  assert.match(
    route,
    /Aucune capture exploitable n'est disponible[\s\S]*l'intention libre du pro/,
  );
  assert.match(
    route,
    /transcription audio vidéo n'est pas disponible : rédiger sans attendre l'audio/,
  );
  assert.match(route, /const workspaceHasVideo = Boolean\(workspaceMedia\.videoForAI\)/);
});
