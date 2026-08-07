import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const policy = read("lib/mediaVideoNormalizationPolicy.ts");
const normalizer = read("lib/mediaVideoNormalizer.ts");
const variants = read("lib/boosterVideoVariantServer.ts");
const transforms = read("lib/boosterVideoTransforms.ts");
const imageNormalizer = read("lib/mediaImageNormalizer.ts");
const imageServer = read("lib/boosterImageServerPreparation.ts");
const rules = read("lib/mediaRules.ts");
const workspaceConsumption = read("lib/mediaWorkspaceConsumption.ts");
const publishModal = read(
  "app/dashboard/booster/publier/PublishModal.tsx",
);

const checks = [
  [
    /VIDEO_NORMALIZATION_MAX_SOURCE_BYTES\s*=\s*[\r\n\s]*INR_MEDIA_VIDEO_SOURCE_MAX_BYTES/.test(
      policy,
    ),
    "worker vidéo aligné sur le plafond unique de 75 Mo",
  ],
  [
    /BOOSTER_VIDEO_DERIVATIVE_KEYS[\s\S]*"canonical"[\s\S]*"thumbnail"[\s\S]*"frame_03"[\s\S]*"audio_track"/.test(
      normalizer,
    ) &&
      /prepareCanonical|libx264/.test(normalizer),
    "fallback vidéo MP4\/H.264\/AAC disponible dans le worker Booster",
  ],
  [
    /CHANNEL_VIDEO_VARIANT_PIPELINE_VERSION = 7/.test(variants),
    "cache des adaptations vidéo conservé",
  ],
  [
    /canUseDirectWorkspaceVideoSource/.test(workspaceConsumption) &&
      /const publicationVariant = directSourceReady \? null : canonical/.test(
        workspaceConsumption,
      ),
    "publication de l'original vérifié avec secours canonique ciblé",
  ],
  [
    !/quality\.videoBitrate/.test(variants),
    "ancien débit ABR fixe supprimé",
  ],
  [
    /preset: "veryfast"/.test(transforms) && /maxVideoKbps/.test(transforms),
    "adaptations manuelles rapides et bornées",
  ],
  [
    /mozjpeg: !providerSafe/.test(imageNormalizer),
    "MozJPEG hors aperçu IA",
  ],
  [
    /CHANNEL_IMAGE_VARIANT_PIPELINE_VERSION = 8/.test(imageServer) &&
      /TIKTOK_CHANNEL_IMAGE_VARIANT_PIPELINE_VERSION = 10/.test(imageServer),
    "caches image invalidés",
  ],
  [
    /quality = 87/.test(imageServer) && /compressionLevel: 9/.test(imageServer),
    "images légères haute qualité",
  ],
  [
    /INR_MEDIA_VIDEO_SOURCE_MAX_BYTES = 75_000_000/.test(rules) &&
      /INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES\s*=\s*[\r\n\s]*INR_MEDIA_VIDEO_SOURCE_MAX_BYTES/.test(
        rules,
      ),
    "contrat vidéo original 75 Mo documenté",
  ],
  [
    /Préparation des médias/.test(publishModal) &&
      !/Compression des médias/.test(publishModal),
    "progression universelle sans étape de compression",
  ],
];

let failures = 0;
console.log("\n=== iNrCy - Optimisation média qualité / vitesse ===\n");
for (const [ok, label] of checks) {
  if (ok) console.log(`PASS  ${label}`);
  else {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}
console.log(
  `\nRésultat : ${checks.length - failures}/${checks.length} contrôles validés.`,
);
if (failures) process.exit(1);
