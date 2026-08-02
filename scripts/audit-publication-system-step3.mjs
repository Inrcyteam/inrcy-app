import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const sources = {
  policy: read("lib/googleBusinessMediaPolicy.ts"),
  videoPolicy: read("lib/videoPublicationPolicy.ts"),
  transforms: read("lib/boosterVideoTransforms.ts"),
  variantServer: read("lib/boosterVideoVariantServer.ts"),
  probe: read("lib/googleBusinessMediaProbe.ts"),
  optimizer: read("lib/imageOptimizer.ts"),
  prewarm: read("app/api/media-pipeline/workspace/prewarm/route.ts"),
  route: read("app/api/booster/publish-now/route.ts"),
  inrsend: read("lib/inrsend/publicationChannelActions.ts"),
};

const checks = [
  {
    id: "gmb-video-limits",
    label: "Google Business possède 75 Mo officiel, 72 Mo cible, 30 s et 720 px",
    ok:
      /75_000_000/.test(sources.policy) &&
      /72_000_000/.test(sources.policy) &&
      /MAX_DURATION_SECONDS = 30/.test(sources.policy) &&
      /MIN_SHORT_EDGE = 720/.test(sources.policy),
  },
  {
    id: "channel-specific-profile",
    label: "La variante Google est isolée du profil social commun",
    ok:
      /GOOGLE_BUSINESS_VIDEO_PROFILE/.test(sources.transforms) &&
      /publicationProfile/.test(sources.transforms) &&
      /CHANNEL_VIDEO_VARIANT_PIPELINE_VERSION = 6/.test(sources.variantServer),
  },
  {
    id: "no-silent-trim",
    label: "Une vidéo de plus de 30 secondes est écartée sans découpe silencieuse",
    ok:
      /action: "omit"/.test(sources.policy) &&
      /n’a pas été coupée automatiquement/.test(sources.variantServer),
  },
  {
    id: "url-probe",
    label: "Images et vidéos sont testées par HEAD puis GET avant l’appel Google",
    ok:
      /method: "HEAD" \| "GET"/.test(sources.probe) &&
      /Range: "bytes=0-0"/.test(sources.probe) &&
      /attempts/.test(sources.probe),
  },
  {
    id: "image-contract",
    label: "Les images Google restent entre 10 Ko et 5 Mo avec 250 px minimum",
    ok:
      /IMAGE_MIN_BYTES = 10 \* 1024/.test(sources.policy) &&
      /IMAGE_OFFICIAL_MAX_BYTES = 5_000_000/.test(sources.policy) &&
      /IMAGE_TARGET_MAX_BYTES = 4_800_000/.test(sources.policy) &&
      /IMAGE_MIN_SHORT_EDGE = 250/.test(sources.policy) &&
      /ensureGoogleBusinessImageCompliance/.test(sources.optimizer),
  },
  {
    id: "prewarm-warning",
    label: "Le préchauffage Google non conforme devient avertissement, pas blocage global",
    ok:
      /mediaWarnings/.test(sources.prewarm) &&
      /isGoogleBusinessVideoValidationOmittable/.test(sources.prewarm),
  },
  {
    id: "publish-text-fallback",
    label: "Publish-now conserve la publication texte sans média Google",
    ok:
      /videoMediaWarningsByChannel/.test(sources.route) &&
      /filterGoogleBusinessMediaUrls/.test(sources.route) &&
      /published_without_video/.test(sources.route),
  },
  {
    id: "inrsend-same-guard",
    label: "iNrSend applique le même contrôle d’URL et le même fallback",
    ok:
      /filterGoogleBusinessMediaUrls/.test(sources.inrsend) &&
      /published_without_image/.test(sources.inrsend) &&
      /published_without_video/.test(sources.inrsend),
  },
];

let failures = 0;
console.log("\n=== iNrCy Publication System - Étape 3 / Google Business blindé ===\n");
for (const check of checks) {
  if (check.ok) console.log(`PASS  ${check.id} - ${check.label}`);
  else {
    failures += 1;
    console.error(`FAIL  ${check.id} - ${check.label}`);
  }
}
console.log(`\nRésultat : ${checks.length - failures}/${checks.length} contrôles validés.`);
if (failures) process.exit(1);
