# Changements du zip stabilise

Date : 2026-06-21

Base utilisee : `inrcy-stable-prod-2026-06-21-source.zip`

Objectif : integrer les documents de stabilisation, de controle et de restauration dans le projet source, sans modifier le code applicatif.

## Fichiers ajoutes

- `docs/stabilisation/STABLE_SNAPSHOT_2026-06-21.md`
- `docs/stabilisation/STABILISATION_ETAPE_2_CONFIG_2026-06-21.md`
- `docs/stabilisation/STABILISATION_ETAPE_3_RESTAURATION_2026-06-21.md`
- `docs/stabilisation/STABILISATION_ETAPE_4_VERCEL_2026-06-21.md`
- `docs/stabilisation/PROCEDURE_RESTAURATION_2026-06-21.md`
- `docs/stabilisation/CHANGEMENTS_ZIP_STABILISE_2026-06-21.md`
- `ops/checks/2026-06-21_storage_policies_readonly_check.sql`

## Fichiers modifies

Aucun fichier applicatif existant n'a ete modifie.

## Fichiers supprimes

Aucun fichier source n'a ete supprime.

## Exclusions conservees

Le zip stabilise ne doit pas contenir :

- `.env*`
- `node_modules`
- `.next`
- `.git`
- `.vercel`
- `test-results`
- `playwright-report`
- fichiers de build generes

## Nature du changement

Changement documentaire et operationnel uniquement.

Impact applicatif attendu : aucun.
