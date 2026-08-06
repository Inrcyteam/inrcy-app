import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const rules = read("lib/mediaRules.ts");
const normalization = read("lib/mediaVideoNormalizationPolicy.ts");
const normalizer = read("lib/mediaVideoNormalizer.ts");
const policies = read("lib/videoPublicationPolicy.ts");
const transforms = read("lib/boosterVideoTransforms.ts");
const sql = read("ops/sql/2026-07-30_media_pipeline_step10_performance_hardening.sql");

const checks = [
  [
    /INR_MEDIA_VIDEO_SOURCE_MAX_BYTES\s*=\s*300\s*\*\s*1024\s*\*\s*1024/.test(rules),
    "source iNrCy maintenue à 300 Mio",
  ],
  [
    /INR_MEDIA_VIDEO_COMPRESSION_TRIGGER_BYTES\s*=\s*70_000_000/.test(rules) &&
      /INR_MEDIA_VIDEO_CANONICAL_TARGET_BYTES\s*=\s*65_000_000/.test(rules) &&
      /INR_MEDIA_VIDEO_CANONICAL_MAX_BYTES\s*=\s*[\s\S]*INR_MEDIA_VIDEO_COMPRESSION_TRIGGER_BYTES\s*-\s*1/.test(rules),
    "compression au-dessus de 70 Mo et master canonique strictement inférieur à 70 Mo",
  ],
  [
    /VIDEO_CANONICAL_MAX_BYTES\s*=\s*[\r\n\s]*INR_MEDIA_VIDEO_CANONICAL_MAX_BYTES/.test(normalization),
    "worker aligné sur la constante canonique unique",
  ],
  [
    /getVideoCanonicalOptimizationProfile/.test(normalization) &&
      /async function encodeMp4/.test(normalizer) &&
      /mode:\s*"size_cap_transcode"/.test(normalizer) &&
      /attempts:\s*1/.test(normalizer),
    "compression bornée en un encodage et remux réservé aux sources légères compatibles",
  ],
  [
    /gmb:\s*\{[\s\S]*GOOGLE_BUSINESS_VIDEO_TARGET_MAX_BYTES/.test(policies),
    "Google Business conserve sa limite dédiée",
  ],
  [
    /maxOutputBytes:\s*GOOGLE_BUSINESS_VIDEO_TARGET_MAX_BYTES/.test(transforms) &&
      /maxOutputBytes:\s*INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES/.test(transforms),
    "profils vidéo global et Google séparés",
  ],
  [
    sql.includes("40894464") && !sql.includes("313524224"),
    "migration SQL historique conservée sans réécriture",
  ],
];

let failures = 0;
console.log("\n=== iNrCy Publication System - Étape 4 / Politique vidéo harmonisée ===\n");
for (const [ok, label] of checks) {
  if (ok) console.log(`PASS  ${label}`);
  else {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}
console.log(`\nRésultat : ${checks.length - failures}/${checks.length} contrôles validés.`);
if (failures) process.exit(1);
