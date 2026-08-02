import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const outcome = read("lib/boosterPublicationOutcome.ts");
const immediate = read("app/api/booster/publish-now/publishNow.foundations.ts");
const asyncPublication = read("lib/boosterAsyncPublication.ts");
const modal = read("app/dashboard/_components/PublishExecutionResultModal.tsx");
const mailbox = read("app/dashboard/mails/_components/MailboxDetailsModal.tsx");
const mailboxHelpers = read("app/dashboard/mails/_lib/mailboxPhase1.tsx");

const checks = [
  [/published_with_warning/.test(outcome), "statut définitif publié avec avertissement"],
  [/isPendingPublicationResult/.test(outcome), "traitement TikTok séparé des avertissements définitifs"],
  [/iNrSend/.test(outcome) && /directement sur le canal/.test(outcome), "conseil de correction visible pour le pro"],
  [/classifyBoosterPublicationResult/.test(immediate) && /warningCount/.test(immediate), "bilan immédiat unifié"],
  [/classifyBoosterPublicationResult/.test(asyncPublication) && /completed_with_warnings/.test(asyncPublication), "bilan asynchrone unifié"],
  [/Publication publiée avec avertissement/.test(modal), "modale Booster explicite"],
  [/Publiée avec avertissement/.test(mailbox), "détail iNrSend explicite"],
  [/channelWarningDot/.test(mailboxHelpers), "indicateur canal iNrSend dédié"],
];

let failures = 0;
console.log("\n=== iNrCy Publication System - Étape 6 / Bilans avec avertissements ===\n");
for (const [ok, label] of checks) {
  if (ok) console.log(`PASS  ${label}`);
  else {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}
console.log(`\nRésultat : ${checks.length - failures}/${checks.length} contrôles validés.`);
if (failures) process.exit(1);
