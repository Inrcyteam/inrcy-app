import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const policy = read("lib/mediaVideoNormalizationPolicy.ts");
const normalizer = read("lib/mediaVideoNormalizer.ts");
const variants = read("lib/boosterVideoVariantServer.ts");
const transforms = read("lib/boosterVideoTransforms.ts");
const imageNormalizer = read("lib/mediaImageNormalizer.ts");
const imageServer = read("lib/boosterImageServerPreparation.ts");
const rules = read("lib/mediaRules.ts");

const checks = [
  [/getVideoCanonicalOptimizationProfile/.test(policy), "profil vidéo poids/durée/résolution"],
  [/VIDEO_CANONICAL_QUALITY_CRF = 21/.test(policy), "qualité CRF élevée"],
  [/encodeQualityOptimizedCanonical/.test(normalizer), "encodage qualité adaptatif"],
  [/actualSavingsRatio < VIDEO_CANONICAL_MIN_SAVINGS_RATIO/.test(normalizer), "remux si le gain réel est trop faible"],
  [!/VIDEO_ULTRAFAST_SOURCE_THRESHOLD_BYTES/.test(normalizer), "ancien seuil poids supprimé"],
  [/CHANNEL_VIDEO_VARIANT_PIPELINE_VERSION = 6/.test(variants), "cache vidéo invalidé"],
  [/requiresSocialOptimization/.test(variants), "source lourde non envoyée directement"],
  [!/quality\.videoBitrate/.test(variants), "ancien débit ABR fixe supprimé"],
  [/preset: "veryfast"/.test(transforms) && /maxVideoKbps/.test(transforms), "profils vidéo rapides à qualité constante"],
  [/mozjpeg: !providerSafe/.test(imageNormalizer), "MozJPEG hors aperçu IA"],
  [/CHANNEL_IMAGE_VARIANT_PIPELINE_VERSION = 7/.test(imageServer), "cache image invalidé"],
  [/quality: 87/.test(imageServer) && /compressionLevel: 9/.test(imageServer), "images légères haute qualité"],
  [/garde-fou/.test(rules) && /durée, résolution et débit/.test(rules), "contrat média documenté"],
];

let failures = 0;
console.log("\n=== iNrCy - Optimisation média qualité / poids / vitesse ===\n");
for (const [ok, label] of checks) {
  if (ok) console.log(`PASS  ${label}`);
  else { failures += 1; console.error(`FAIL  ${label}`); }
}
console.log(`\nRésultat : ${checks.length - failures}/${checks.length} contrôles validés.`);
if (failures) process.exit(1);
