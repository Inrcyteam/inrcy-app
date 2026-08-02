import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (file) => readFileSync(resolve(ROOT, file), "utf8");

const requiredFiles = [
  "lib/mediaRules.ts",
  "app/dashboard/booster/publier/PublishModal.tsx",
  "app/dashboard/booster/publier/usePublishImageController.ts",
  "app/dashboard/booster/publier/usePublishVideoController.ts",
  "app/dashboard/booster/publier/publishModal.shared.tsx",
  "app/dashboard/booster/publier/usePersistentMediaWorkspace.ts",
  "lib/boosterGenerationTransportClient.ts",
  "app/api/booster/generate/route.ts",
  "app/api/booster/upload-prepared/route.ts",
  "app/api/booster/video-upload-url/route.ts",
  "app/api/booster/video-transform/route.ts",
  "app/api/media-pipeline/upload-intent/route.ts",
  "app/api/media-pipeline/upload-event/route.ts",
  "app/api/media-pipeline/workspace/prewarm/route.ts",
  "app/api/media-library/upload/route.ts",
  "app/dashboard/mediatheque/MediaLibraryClient.tsx",
  "ops/sql/20260625_pro_media_library.sql",
];

const missingFiles = requiredFiles.filter((file) => !existsSync(resolve(ROOT, file)));
if (missingFiles.length) {
  console.error("ÉCHEC AUDIT — fichiers critiques absents :");
  missingFiles.forEach((file) => console.error(`  - ${file}`));
  process.exit(1);
}

const sources = new Map(requiredFiles.map((file) => [file, read(file)]));
const violations = [];

function requirePattern(file, pattern, label) {
  const source = sources.get(file) || "";
  if (!pattern.test(source)) {
    violations.push(`${label} absent de ${file}`);
  }
}

function forbidPattern(file, pattern, label) {
  const source = sources.get(file) || "";
  if (pattern.test(source)) {
    violations.push(`${label} encore présent dans ${file}`);
  }
}

requirePattern(
  "lib/mediaRules.ts",
  /INR_MEDIA_PUBLICATION_MAX_IMAGE_COUNT\s*=\s*5/,
  "Contrat maximum 5 images",
);
requirePattern(
  "lib/mediaRules.ts",
  /INR_MEDIA_IMAGE_MAX_BYTES\s*=\s*50\s*\*\s*1024\s*\*\s*1024/,
  "Limite image source 50 Mo",
);
requirePattern(
  "lib/mediaRules.ts",
  /INR_MEDIA_PUBLICATION_IMAGES_TOTAL_MAX_BYTES\s*=\s*150\s*\*\s*1024\s*\*\s*1024/,
  "Limite totale images 150 Mo",
);
requirePattern(
  "lib/mediaRules.ts",
  /INR_MEDIA_VIDEO_SOURCE_MAX_BYTES\s*=\s*300\s*\*\s*1024\s*\*\s*1024/,
  "Limite vidéo source 300 Mo",
);
forbidPattern(
  "app/dashboard/booster/publier/usePublishImageController.ts",
  /convertHeicOrHeifImageFile/,
  "Conversion HEIC/HEIF via Vercel",
);
forbidPattern(
  "app/dashboard/booster/publier/publishModal.shared.tsx",
  /\/api\/booster\/convert-image/,
  "Route Vercel de conversion HEIC/HEIF",
);
if (existsSync(resolve(ROOT, "app/api/booster/convert-image/route.ts"))) {
  violations.push("La route historique /api/booster/convert-image existe encore");
}
requirePattern(
  "app/dashboard/booster/publier/usePublishImageController.ts",
  /uploadBoosterImageFileDirect\(/,
  "Upload direct signé des images",
);
requirePattern(
  "app/dashboard/booster/publier/usePersistentMediaWorkspace.ts",
  /mediaType\s*===\s*"video"\s*\?\s*1\s*:\s*3/,
  "Upload parallèle borné des images",
);
requirePattern(
  "app/dashboard/booster/publier/usePersistentMediaWorkspace.ts",
  /queueBackgroundPreparation/,
  "Préparation serveur anticipée",
);
requirePattern(
  "app/dashboard/booster/publier/usePersistentMediaWorkspace.ts",
  /prewarmWorkspace/,
  "Préchauffage des variantes de publication",
);
requirePattern(
  "app/api/media-pipeline/upload-event/route.ts",
  /verifyStoredUpload/,
  "Confirmation serveur des octets stockés",
);
requirePattern(
  "app/dashboard/mediatheque/MediaLibraryClient.tsx",
  /uploadFileToPreparedUniversalIntent\(|\.uploadToSignedUrl\(\s*prepared\.storage_path,/,
  "Upload Médiathèque direct Supabase",
);
requirePattern(
  "app/api/media-library/upload/route.ts",
  /mode\s*===\s*"prepare"|case\s+"prepare"/,
  "Phase prepare de la Médiathèque",
);
requirePattern(
  "app/api/media-library/upload/route.ts",
  /mode\s*===\s*"finalize"|case\s+"finalize"/,
  "Phase finalize de la Médiathèque",
);
requirePattern(
  "lib/boosterGenerationTransportClient.ts",
  /transport:\s*"multipart"/,
  "Transport multipart des médias IA",
);
requirePattern(
  "app/dashboard/booster/publier/PublishModal.tsx",
  /imagesByChannel:\s*buildChannelRecord\([\s\S]{0,100}uploadedChannelImages/,
  "Contrat imagesByChannel de publication",
);
requirePattern(
  "app/dashboard/booster/publier/PublishModal.tsx",
  /imageSettingsByChannel:\s*buildChannelRecord\([\s\S]{0,100}channelSettings/,
  "Contrat imageSettingsByChannel de publication",
);
requirePattern(
  "app/dashboard/booster/publier/PublishModal.tsx",
  /fetch\("\/api\/agent\/scheduled-actions"/,
  "Création des programmations iNrAgent",
);
requirePattern(
  "app/dashboard/booster/publier/usePublishVideoController.ts",
  /buildVideoTransformSignature/,
  "Signature stable des variantes vidéo",
);
requirePattern(
  "ops/sql/20260625_pro_media_library.sql",
  /create table if not exists public\.pro_media_library/,
  "Registre média",
);
requirePattern(
  "ops/sql/20260625_pro_media_library.sql",
  /create policy "pro_media_library_select_own"/,
  "RLS de lecture de la Médiathèque",
);

console.log("iNrCy — audit du pipeline média\n");
console.log(`  - fichiers critiques vérifiés : ${requiredFiles.length}`);
console.log("  - sources envoyées directement au stockage signé");
console.log("  - HEIC/HEIF préparés par les workers, hors fonctions Vercel");
console.log("  - préparation anticipée et variantes mises en cache");
console.log("  - contrats de publication et de programmation conservés");

if (violations.length) {
  console.error("\nÉCHEC AUDIT — pipeline média incohérent :");
  violations.forEach((violation) => console.error(`  - ${violation}`));
  process.exitCode = 1;
} else {
  console.log("\nAUDIT OK — pipeline direct, anticipé et sécurisé.");
}
