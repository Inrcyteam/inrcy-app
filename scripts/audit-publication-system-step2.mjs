import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const sources = {
  customization: read("lib/boosterImageCustomization.ts"),
  controller: read("app/dashboard/booster/publier/usePublishImageController.ts"),
  server: read("lib/boosterImageServerPreparation.ts"),
  route: read("app/api/booster/publish-now/route.ts"),
};

const checks = [
  {
    id: "scope-centralized",
    label: "La sélection et la provenance Adapter sont normalisées par une politique unique",
    ok: /normalizeBoosterImageCustomizationScope/.test(sources.customization),
  },
  {
    id: "client-exact-selection",
    label: "Le client conserve une sélection vide ou partielle sans réinjecter tous les médias",
    ok:
      /fallbackToAvailableWhenSelectionEmpty: false/.test(sources.controller) &&
      /customizationScope\.imageKeys/.test(sources.controller),
  },
  {
    id: "per-media-provenance",
    label: "La personnalisation est vérifiée pour la clé exacte du média",
    ok:
      /isBoosterImageExplicitlyCustomized/.test(sources.controller) &&
      /isBoosterImageExplicitlyCustomized/.test(sources.server),
  },
  {
    id: "partial-selection-preserved",
    label: "Le serveur ne remplace plus une sélection partielle par tout le workspace",
    ok:
      /const exactChannelSources = requestedSettings\.imageKeys/.test(sources.server) &&
      /fallbackToAvailableWhenSelectionEmpty: !hasExplicitImageSelection/.test(
        sources.server,
      ) &&
      !/ordered\.length === valid\.length \? ordered : valid/.test(sources.server),
  },
  {
    id: "channel-cache-isolated",
    label: "Le cache de variante reste isolé par média, canal et mode",
    ok:
      /imageKey: entry\.imageKey/.test(sources.server) &&
      /channel,\n\s*mode,/.test(sources.server),
  },
  {
    id: "channel-payload-isolated",
    label: "La route publie le tableau d’images propre à chaque canal",
    ok: /imagesByChannel\[channel\]/.test(sources.route),
  },
  {
    id: "apply-all-explicit",
    label: "Appliquer à tous parcourt et classe chaque média individuellement",
    ok:
      /for \(const imageKey of imageKeysForChannel\)/.test(sources.controller) &&
      /customizedImageKeys\.add\(imageKey\)/.test(sources.controller),
  },
];

let failures = 0;
console.log("\n=== iNrCy Publication System - Étape 2 / Adapter exact ===\n");
for (const check of checks) {
  if (check.ok) console.log(`PASS  ${check.id} - ${check.label}`);
  else {
    failures += 1;
    console.error(`FAIL  ${check.id} - ${check.label}`);
  }
}
console.log(`\nRésultat : ${checks.length - failures}/${checks.length} contrôles validés.`);
if (failures) process.exit(1);
