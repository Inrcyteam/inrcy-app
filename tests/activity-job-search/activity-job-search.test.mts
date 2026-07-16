import assert from "node:assert/strict";
import test from "node:test";

import { searchActivityJobs } from "../../lib/activityJobSearch.ts";

test("trouve un métier à partir de quelques lettres", () => {
  const [result] = searchActivityJobs("paysa");
  assert.equal(result?.job, "paysagiste");
  assert.equal(result?.sectorCategory, "exterieur_jardin");
});

test("ignore les accents et les tirets", () => {
  const [result] = searchActivityJobs("auto ecole");
  assert.equal(result?.job, "auto_ecole");
  assert.equal(result?.sectorCategory, "formation_enseignement");
});

test("retrouve un métier depuis un alias courant", () => {
  const [result] = searchActivityJobs("permis bateau");
  assert.equal(result?.job, "bateau_ecole");
});

test("tolère une petite faute de frappe", () => {
  const [result] = searchActivityJobs("payagiste");
  assert.equal(result?.job, "paysagiste");
});

test("classe la correspondance métier exacte avant les résultats voisins", () => {
  const [result] = searchActivityJobs("agence de communication");
  assert.equal(result?.job, "agence_communication");
  assert.equal(result?.sectorCategory, "communication");
});
