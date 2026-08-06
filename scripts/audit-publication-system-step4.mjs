import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const rules = read("lib/mediaRules.ts");
const normalization = read("lib/mediaVideoNormalizationPolicy.ts");
const normalizer = read("lib/mediaVideoNormalizer.ts");
const policies = read("lib/videoPublicationPolicy.ts");
const transforms = read("lib/boosterVideoTransforms.ts");
const sql = read(
  "ops/sql/2026-07-30_media_pipeline_step10_performance_hardening.sql",
);

const checks = [
  [
    /INR_MEDIA_VIDEO_SOURCE_MAX_BYTES\s*=\s*75_000_000/.test(rules) &&
      /INR_MEDIA_VIDEO_SOURCE_MAX_MB_LABEL\s*=\s*"75 Mo"/.test(rules),
    "source vidéo plafonnée exactement à 75 000 000 octets",
  ],
  [
    /INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES\s*=\s*[\r\n\s]*INR_MEDIA_VIDEO_SOURCE_MAX_BYTES/.test(
      rules,
    ) &&
      !/INR_MEDIA_VIDEO_(?:COMPRESSION_TRIGGER|CANONICAL_(?:TARGET|MAX))_BYTES/.test(
        rules,
      ),
    "publication alignée sur l'original sans seuil de compression",
  ],
  [
    /INR_MEDIA_ALLOWED_VIDEO_EXTENSIONS\s*=\s*\[[\s\S]*"mp4"[\s\S]*"m4v"[\s\S]*"mov"/.test(
      rules,
    ) &&
      !/"webm"|"avi"|"mkv"/.test(
        rules.match(/INR_MEDIA_ALLOWED_VIDEO_EXTENSIONS[\s\S]*?\] as const/)?.[0] || "",
      ),
    "formats vidéo Booster limités à MP4, M4V et MOV",
  ],
  [
    /BOOSTER_VIDEO_DERIVATIVE_KEYS[\s\S]*"thumbnail"[\s\S]*"frame_01"[\s\S]*"audio_track"/.test(
      normalizer,
    ) &&
      !/async function encodeMp4|libx264|size_cap_transcode/.test(normalizer),
    "worker actif limité au probe, aux captures et à l'audio IA",
  ],
  [
    /canonical et ai_preview restent lisibles/.test(normalization) &&
      /ne produit plus aucun fichier vid/.test(normalization),
    "anciens dérivés lisibles uniquement pour la compatibilité des brouillons",
  ],
  [
    /gmb:\s*\{[\s\S]*maxBytes:\s*GOOGLE_BUSINESS_VIDEO_MAX_BYTES/.test(
      policies,
    ) &&
      !/GOOGLE_BUSINESS_VIDEO_TARGET_MAX_BYTES/.test(policies),
    "Google Business utilise le même plafond de 75 Mo sans cible compressée",
  ],
  [
    /maxOutputBytes:\s*GOOGLE_BUSINESS_VIDEO_MAX_BYTES/.test(transforms) &&
      /maxOutputBytes:\s*INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES/.test(transforms),
    "encodage réservé aux adaptations explicites de format ou de canal",
  ],
  [
    sql.includes("40894464") && !sql.includes("313524224"),
    "migration SQL historique conservée sans réécriture",
  ],
];

let failures = 0;
console.log("\n=== iNrCy Publication System - Étape 4 / Contrat vidéo 75 Mo ===\n");
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
