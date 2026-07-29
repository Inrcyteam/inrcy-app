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
  "lib/boosterGenerationTransportClient.ts",
  "app/api/booster/generate/route.ts",
  "app/api/booster/convert-image/route.ts",
  "app/api/booster/upload-prepared/route.ts",
  "app/api/booster/video-upload-url/route.ts",
  "app/api/booster/video-transform/route.ts",
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
const observations = [];

function requirePattern(file, pattern, label) {
  const source = sources.get(file) || "";
  if (!pattern.test(source)) {
    violations.push(`${label} absent de ${file}`);
  }
}

function countPattern(file, pattern) {
  const source = sources.get(file) || "";
  return Array.from(source.matchAll(pattern)).length;
}

requirePattern(
  "lib/mediaRules.ts",
  /INR_MEDIA_PUBLICATION_MAX_IMAGE_COUNT\s*=\s*5/,
  "Contrat maximum 5 images",
);
requirePattern(
  "lib/mediaRules.ts",
  /INR_MEDIA_VIDEO_SOURCE_MAX_BYTES\s*=\s*100\s*\*\s*1024\s*\*\s*1024/,
  "Limite vidéo source historique 100 Mo",
);
requirePattern(
  "app/dashboard/booster/publier/usePublishImageController.ts",
  /incoming\.map\(\(file\)\s*=>\s*convertHeicOrHeifImageFile\(file\)\)/,
  "Conversion HEIC/HEIF à l'insertion",
);
requirePattern(
  "app/dashboard/booster/publier/publishModal.shared.tsx",
  /fetch\("\/api\/booster\/convert-image"/,
  "Route historique de conversion image",
);
requirePattern(
  "app/dashboard/booster/publier/publishModal.shared.tsx",
  /fetch\("\/api\/booster\/upload-prepared"/,
  "Route historique d'upload des images préparées",
);
requirePattern(
  "app/dashboard/booster/publier/usePublishImageController.ts",
  /uploadBoosterImageFileDirect\(/,
  "Upload partagé des images de brouillon",
);
requirePattern(
  "app/dashboard/booster/publier/publishModal.shared.tsx",
  /uploadToSignedUrl\(storagePath, token, file/,
  "Upload vidéo direct signé",
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
  /imagesByChannel:\s*uploadedChannelImages/,
  "Contrat imagesByChannel de publication",
);
requirePattern(
  "app/dashboard/booster/publier/PublishModal.tsx",
  /imageSettingsByChannel:\s*channelSettings/,
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
  "Registre média existant",
);
requirePattern(
  "ops/sql/20260625_pro_media_library.sql",
  /create policy "pro_media_library_select_own"/,
  "RLS de lecture de la Médiathèque",
);

const publishModal = sources.get("app/dashboard/booster/publier/PublishModal.tsx") || "";
const imageUploadCalls =
  countPattern(
    "app/dashboard/booster/publier/PublishModal.tsx",
    /uploadOriginalImagesForPublication\(/g,
  ) +
  countPattern(
    "app/dashboard/booster/publier/PublishModal.tsx",
    /uploadPreparedImages\(/g,
  );
const videoUploadCalls = countPattern(
  "app/dashboard/booster/publier/PublishModal.tsx",
  /uploadPublicationVideoForPublish\(\)/g,
);
const scheduleRouteCalls = countPattern(
  "app/dashboard/booster/publier/PublishModal.tsx",
  /fetch\("\/api\/agent\/scheduled-actions"/g,
);

if (imageUploadCalls < 4) {
  violations.push(
    `Le baseline attend plusieurs uploads images tardifs publication/programmation (trouvé: ${imageUploadCalls}).`,
  );
}
if (videoUploadCalls < 2) {
  violations.push(
    `Le baseline attend un upload vidéo dans publication et programmation (trouvé: ${videoUploadCalls}).`,
  );
}
if (scheduleRouteCalls < 1) {
  violations.push("Aucun appel de programmation Booster détecté.");
}
if (!/setVideoFile\(normalizedFile\)/.test(publishModal)) {
  violations.push("Le File vidéo local n'est plus détecté dans l'état Booster.");
}

observations.push({
  status: "À remplacer",
  item: "Images binaires via Vercel",
  detail: "/api/booster/convert-image et /api/booster/upload-prepared",
});
observations.push({
  status: "À déplacer",
  item: "Moment de l'upload",
  detail: "principalement au brouillon, à la publication ou à la programmation",
});
observations.push({
  status: "À réutiliser",
  item: "Upload direct Supabase",
  detail: "vidéo Booster et Médiathèque via uploadToSignedUrl",
});
observations.push({
  status: "À préserver",
  item: "Contrats connecteurs",
  detail: "imagesByChannel, imageSettingsByChannel, video et transformedVariants",
});
observations.push({
  status: "À préserver",
  item: "Expérience éditoriale",
  detail: "média avant ou après génération sans remplacement automatique du texte",
});

console.log("iNrCy — audit pipeline média — Étape 1\n");
console.log("Inventaire vérifié :");
console.log(`  - fichiers critiques : ${requiredFiles.length}`);
console.log(`  - appels d'upload image tardifs détectés : ${imageUploadCalls}`);
console.log(`  - appels d'upload vidéo publication/programmation : ${videoUploadCalls}`);
console.log(`  - création de programmation détectée : ${scheduleRouteCalls ? "OUI" : "NON"}`);
console.log("");

console.log("Décisions de migration :");
for (const observation of observations) {
  console.log(`  - [${observation.status}] ${observation.item} — ${observation.detail}`);
}

if (violations.length) {
  console.error("\nÉCHEC AUDIT — baseline média incohérent :");
  violations.forEach((violation) => console.error(`  - ${violation}`));
  process.exitCode = 1;
} else {
  console.log(
    "\nAUDIT OK — comportement actuel cartographié, contrats critiques verrouillés, aucune bascule runtime effectuée.",
  );
}
