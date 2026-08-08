import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateGeneratorRevenue,
  getGeneratorRecommendation,
  sanitizeGeneratorBusinessSettings,
} from "../../lib/generatorSettings.ts";

test("generator recommendations follow the saved business sector", () => {
  const beauty = getGeneratorRecommendation("[[SECTOR:beaute_bien_etre]] Coiffeur");
  const construction = getGeneratorRecommendation("[[SECTOR:artisan_btp]] Plombier");

  assert.equal(beauty.avgBasket, 75);
  assert.equal(beauty.conversionRate, 35);
  assert.equal(construction.avgBasket, 1800);
  assert.equal(construction.conversionRate, 20);
});

test("existing valid values always remain prioritary", () => {
  const recommendation = getGeneratorRecommendation("[[SECTOR:artisan_btp]] Plombier");
  assert.deepEqual(sanitizeGeneratorBusinessSettings(430, 17, recommendation), {
    avgBasket: 430,
    conversionRate: 17,
  });
});

test("sector defaults only fill absent or invalid values", () => {
  const recommendation = getGeneratorRecommendation("[[SECTOR:communication]] Agence de communication");
  assert.deepEqual(sanitizeGeneratorBusinessSettings(null, 0, recommendation), {
    avgBasket: 950,
    conversionRate: 20,
  });
});

test("the live estimate uses the historical generator formula", () => {
  assert.equal(
    estimateGeneratorRevenue(47, { avgBasket: 250, conversionRate: 20 }),
    2350,
  );
});
