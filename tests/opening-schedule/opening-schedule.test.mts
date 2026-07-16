import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOpeningHoursSpecifications,
  buildOpeningScheduleAiInstruction,
  combineOpeningSchedule,
  normalizeOpeningScheduleText,
} from "../../lib/openingSchedule.ts";

test("fusionne les anciens champs jours et horaires sans perdre les comptes existants", () => {
  assert.equal(
    combineOpeningSchedule("Lundi-Vendredi", "8h00-18h00"),
    "Lundi-Vendredi : 8h00-18h00",
  );
});

test("conserve le nouveau planning libre ligne par ligne", () => {
  const schedule = "Lundi : 9h - 13h\r\nMardi : 15h - 19h\nMercredi : fermé";
  assert.equal(
    normalizeOpeningScheduleText(schedule),
    "Lundi : 9h - 13h\nMardi : 15h - 19h\nMercredi : fermé",
  );
  assert.equal(combineOpeningSchedule("", schedule), normalizeOpeningScheduleText(schedule));
});

test("la consigne IA interdit toute déduction et considère les jours absents comme fermés", () => {
  const instruction = buildOpeningScheduleAiInstruction({
    business: {
      openingDays: "",
      openingHours: "Lundi : 9h - 13h\nMardi : 15h - 19h",
    },
  });

  assert.match(instruction, /Tout jour absent est considéré comme fermé/i);
  assert.match(instruction, /Ne jamais déduire, compléter ou inventer/i);
  assert.match(instruction, /Lundi : 9h - 13h/i);
});

test("génère des horaires structurés pour plusieurs jours et plages", () => {
  const specs = buildOpeningHoursSpecifications(
    "Lundi-Vendredi : 9h-12h / 14h-18h\nSamedi : 9h-13h\nDimanche : fermé",
  );

  assert.ok(specs);
  assert.equal(specs.length, 3);
  assert.equal(specs[0].dayOfWeek.length, 5);
  assert.equal(specs[0].opens, "09:00");
  assert.equal(specs[0].closes, "12:00");
  assert.equal(specs[2].dayOfWeek[0], "https://schema.org/Saturday");
});
