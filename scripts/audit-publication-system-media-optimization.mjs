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

const checks = [
  [
    /getVideoCanonicalOptimizationProfile/.test(policy),
    "profil vidéo poids/durée/résolution",
  ],
  [
    /VIDEO_CANONICAL_TARGET_BYTES =\s*[\r\n\s]*INR_MEDIA_VIDEO_CANONICAL_TARGET_BYTES/.test(
      policy,
    ),
    "master commun ciblé à 65 Mo",
  ],
  [
    /getVideoTargetBitrateKbps/.test(normalizer),
    "débit calculé selon la durée",
  ],
  [
    /One duration-aware encode only/.test(normalizer),
    "un seul encodage borné",
  ],
  [
    !/VIDEO_ULTRAFAST_SOURCE_THRESHOLD_BYTES/.test(normalizer),
    "ancien seuil poids supprimé",
  ],
  [
    /CHANNEL_VIDEO_VARIANT_PIPELINE_VERSION = 7/.test(variants),
    "cache vidéo invalidé",
  ],
  [
    /sourceSizeBytes >= VIDEO_SHARED_CANONICAL_PREFERRED_SOURCE_BYTES/.test(
      workspaceConsumption,
    ),
    "source lourde jamais envoyée directement",
  ],
  [
    !/quality\.videoBitrate/.test(variants),
    "ancien débit ABR fixe supprimé",
  ],
  [
    /preset: "veryfast"/.test(transforms) && /maxVideoKbps/.test(transforms),
    "profils vidéo rapides bornés",
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
    /INR_MEDIA_VIDEO_COMPRESSION_TRIGGER_BYTES = 70_000_000/.test(rules) &&
      /INR_MEDIA_VIDEO_CANONICAL_TARGET_BYTES = 65_000_000/.test(rules),
    "contrat média documenté",
  ],
];

let failures = 0;
console.log("\n=== iNrCy - Optimisation média qualité / poids / vitesse ===\n");
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
