import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inferSectorCategoryFromProfession,
} from '../../lib/activitySectors.ts';
import {
  findJobValueByLabel,
  getJobsForSector,
  getServicesForSectorAndJob,
} from '../../lib/activityCatalog.ts';
import { searchActivityJobs } from '../../lib/activityJobSearch.ts';
import { magicienJobTemplates } from '../../lib/templates/sectors/evenementiel/magicien.ts';

test('Magicien est rattaché au secteur Événementiel sans confusion métier', () => {
  const evenementielCases = [
    'Magicien',
    'Spectacle de magie',
    'Illusionniste',
    'Prestidigitateur',
    'Magie close-up',
  ];

  for (const profession of evenementielCases) {
    assert.equal(inferSectorCategoryFromProfession(profession), 'evenementiel');
  }

  assert.equal(
    inferSectorCategoryFromProfession('Magnétiseur'),
    'medecine_douce',
  );
});

test('le catalogue Événementiel contient Magicien et ses huit prestations', () => {
  const jobs = getJobsForSector('evenementiel');
  assert.ok(
    jobs.some((job) => job.value === 'magicien' && job.label === 'Magicien'),
  );

  assert.deepEqual(
    getServicesForSectorAndJob('evenementiel', 'magicien'),
    [
      'Magie close-up',
      'Spectacle de magie',
      'Mariage',
      'Anniversaire',
      'Événement d’entreprise',
      'Cocktail / réception',
      'Soirée privée',
      'Animation sur mesure',
    ],
  );
});

test('la recherche intelligente reconnaît les variantes de Magicien', () => {
  const queries = [
    'magicien',
    'magie',
    'illusionniste',
    'prestidigitateur',
    'close up',
  ];

  for (const query of queries) {
    const result = searchActivityJobs(query).find(
      (candidate) =>
        candidate.sectorCategory === 'evenementiel' &&
        candidate.job === 'magicien',
    );
    assert.ok(result, `Magicien doit être trouvé pour « ${query} »`);
  }
});

test('les libellés historiques retrouvent la clé technique Magicien', () => {
  const aliases = [
    'Magicien',
    'Magie',
    'Magie close-up',
    'Spectacle de magie',
    'Illusionniste',
    'Prestidigitateur',
  ];

  for (const alias of aliases) {
    assert.equal(
      findJobValueByLabel('evenementiel', alias),
      'magicien',
    );
  }
});

test('le pack de templates Magicien est dédié à l’événementiel', () => {
  assert.equal(magicienJobTemplates.sector, 'evenementiel');
  assert.equal(magicienJobTemplates.professionKey, 'magicien');
  assert.equal(magicienJobTemplates.professionLabel, 'Magicien');
  assert.match(magicienJobTemplates.pack.promoLead, /mariage/i);
  assert.match(magicienJobTemplates.pack.promoLead, /anniversaire/i);
  assert.match(magicienJobTemplates.pack.promoLead, /entreprise/i);
  assert.doesNotMatch(
    JSON.stringify(magicienJobTemplates),
    /mentalisme|mentaliste/i,
  );
});
