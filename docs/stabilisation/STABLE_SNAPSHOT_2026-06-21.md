# Point Stable iNrCy - 2026-06-21

Nom conseille : `stable-prod-2026-06-21`

## Livrables

- Archive source propre : `inrcy-stable-prod-2026-06-21-source.zip`
- Empreinte SHA-256 : `inrcy-stable-prod-2026-06-21-source.sha256.txt`

SHA-256 :

```text
E85773C40F8D8FD5F570F28A78239BEE668D4374E9E5D47E562C37DF740008E7
```

## Contenu

- Code applicatif, docs, migrations, tests, assets publics et fichiers de configuration.
- `package-lock.json` inclus pour reconstruire les dependances de facon reproductible.
- Aucun fichier `.env*`.
- `node_modules` exclu.
- `.next` exclu.
- `test-results` / rapports generes exclus.

## Verification faite sur le zip complet

- `npm run typecheck` : OK
- `npm run lint` : OK
- `npm run verify:env` : OK, avec variables absentes attendues car le zip ne contient pas `.env.local`
- `npm run build` : bloque dans cet environnement sur le chargement TLS des polices Google `Geist` via `next/font/google`
- `npm run test:multicompte` : a corriger, les tests sont bloques par l'environnement et par des references obsoletes/manquantes

## Restauration

1. Dezipper l'archive dans un dossier propre.
2. Restaurer les variables d'environnement depuis Vercel/Supabase, sans les commiter.
3. Lancer `npm ci`.
4. Lancer `npm run typecheck`.
5. Lancer `npm run lint`.
6. Deployer en Preview avant toute remise en production.

## Regle de prudence

Cette archive est un point de reference source. Elle ne modifie pas l'application en production et ne contient pas de secrets.
