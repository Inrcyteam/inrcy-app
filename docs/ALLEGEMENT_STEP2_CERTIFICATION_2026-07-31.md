# Allegement - Etape 2 - Certification du nettoyage sans risque

Date : 31 juillet 2026

## Perimetre

Cette etape ne modifie aucune logique applicative. Elle certifie l'archive issue de l'Etape 1 et ajoute uniquement le present rapport dans `docs/`.

## Archive controlee

- SHA-256 de l'archive d'entree : `fd5395a14558adf0160a01c821e05c710f93aca62d41a6e673eae9ac559161e2`
- Taille de l'archive d'entree : `8600287` octets
- Integrite ZIP : validee, aucune erreur de compression

## Fichiers supprimes a l'Etape 1 et confirmes absents

- `tsconfig.tsbuildinfo`
- `public/mobile-shortcuts/propulser-bubble.png`
- `public/mobile-shortcuts/fideliser-bubble.png`
- `public/mobile-shortcuts/reputation-bubble.png`
- `public/agent/inr-agent-robot.png`
- `public/agent/inr-agent-robot-cutout.png`

Aucune reference applicative aux cinq images supprimees n'a ete trouvee dans le code, les styles, les scripts ou les manifestes.

## Remplacements actifs confirmes presents

- `public/agent/inr-agent-robot-cutout.webp`
- `public/mobile-shortcuts/optimized/propulser-shortcut.png`
- `public/mobile-shortcuts/optimized/fideliser-shortcut.png`
- `public/mobile-shortcuts/optimized/reputation-shortcut.png`

Le cache TypeScript est couvert par la regle `*.tsbuildinfo` de `.gitignore`.

## Tests

Lancement global des fichiers `*.test.mjs` et `*.test.mts` avec Node :

- 688 entrees detectees par le runner
- 686 tests reussis
- 0 echec fonctionnel
- 2 fichiers de tests non executables avant demarrage, faute de dependances locales :
  - `tests/media-pipeline/media-pipeline-bmp-normalization.test.mts` requiert `bmp-js`
  - `tests/media-pipeline/media-pipeline-production-regressions.test.mts` requiert `sharp`

Ces deux indisponibilites ne sont pas liees au nettoyage.

## Audits statiques

Les 12 audits suivants ont reussi :

- multicompte
- AI Gateway
- pipeline media, etapes 1 a 10

## Limite de l'environnement de certification

`npm ci` n'a pas pu telecharger `zod-validation-error@4.0.2` depuis le registre npm interne, qui a repondu HTTP 404. Le lint, le typecheck et le build necessitant l'installation complete des dependances doivent donc rester controles par la CI du depot.

## Garantie de modification

A l'issue de cette etape :

- aucun fichier de code n'a ete modifie ;
- aucun import n'a ete modifie ;
- aucun asset supplementaire n'a ete supprime ;
- aucun comportement applicatif n'a ete change ;
- seul ce rapport de certification a ete ajoute.
