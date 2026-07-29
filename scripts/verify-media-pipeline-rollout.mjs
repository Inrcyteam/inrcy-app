import {
  MEDIA_PIPELINE_ALL_FLAG_KEYS,
  buildMediaPipelineCertificationSnapshot,
} from "../lib/mediaPipelineCertification.ts";

const snapshot = buildMediaPipelineCertificationSnapshot(process.env);
const requireCutover = process.env.REQUIRE_MEDIA_PIPELINE_CUTOVER === "1";

console.log("iNrCy — vérification du déploiement pipeline média\n");
console.log(`Étape détectée : ${snapshot.stage}`);
console.log(`Version de certification : ${snapshot.version}`);
console.log("\nFlags :");
for (const key of MEDIA_PIPELINE_ALL_FLAG_KEYS) {
  console.log(`  - ${key}=${snapshot.flags[key] ? "true" : "false"}`);
}

if (snapshot.warnings.length > 0) {
  console.warn("\nAvertissements :");
  for (const warning of snapshot.warnings) console.warn(`  - ${warning}`);
}

if (snapshot.errors.length > 0) {
  console.error("\nConfiguration incohérente :");
  for (const error of snapshot.errors) console.error(`  - ${error}`);
  process.exit(1);
}

if (requireCutover && !snapshot.fullCutoverEnabled) {
  console.error(
    "\nREQUIRE_MEDIA_PIPELINE_CUTOVER=1 mais la bascule complète n'est pas activée.",
  );
  process.exit(1);
}

console.log("\nConfiguration cohérente.");
console.log(
  snapshot.fullCutoverEnabled
    ? "CERTIFICATION FLAGS OK — bascule complète active."
    : "CERTIFICATION FLAGS OK — palier progressif valide.",
);
