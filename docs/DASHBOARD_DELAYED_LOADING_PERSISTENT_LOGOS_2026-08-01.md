# Dashboard — chargement différé et logos persistants (2026-08-01)

## Objectif

Éviter l'affichage inutile de « Chargement… » lorsque l'ouverture est quasi instantanée, tout en donnant un retour clair si une navigation, un outil ou une modale prend réellement du temps. Empêcher également les logos des bulles de réapparaître avec retard lors des retours au dashboard.

## Hook commun

`hooks/useDelayedPendingAction.ts` centralise le comportement :

- l'action devient pending immédiatement afin de bloquer le double clic sur le seul bouton concerné ;
- le libellé « Chargement… » n'apparaît qu'après 180 ms ;
- si l'action se termine avant 180 ms, le libellé n'apparaît jamais ;
- une fois visible, il reste lisible au moins 250 ms pour les ouvertures qui restent dans la page (panneaux et modales) ;
- un filet de sécurité libère l'état au bout de 8 secondes si aucune destination n'est détectée.

## Boutons couverts

Le hook est utilisé sur les principales actions du dashboard qui ouvrent réellement quelque chose :

- routes des outils (`DashboardActionButton`) ;
- outils Pilotage et Boîte de vitesse (`DashboardModulesCard`) ;
- modales Publier et Cash ;
- panneaux de réglages concernés ;
- boutons « Configurer » des bulles (`DashboardFluxBubble`).

Les actions locales instantanées (carrousel, cases, onglets, aides simples) ne reçoivent pas de loader.

## Logos des bulles

Les logos sont désormais importés comme ressources statiques fingerprintées par Next.js. Ils bénéficient ainsi d'URLs immuables et du cache long terme de `/_next/static/media`.

Le layout dashboard :

- précharge en priorité les logos des bulles ;
- maintient une copie invisible et eager de ces logos via `DashboardPersistentImageCache` ;
- conserve cette banque d'images montée pendant la navigation entre les outils du dashboard ;
- garde les images visibles et les icônes du carrousel en chargement eager avec dimensions fixes.

## Warmup des outils

Le warmup progressif précédent reste inchangé :

- il démarre automatiquement après le premier rendu, même sans action du professionnel ;
- deux tâches maximum sont exécutées simultanément ;
- le survol, le focus, le pointerdown ou le clic font remonter l'outil visé en priorité ;
- les logos ne passent pas dans cette file : ils sont des ressources critiques séparées.

## Vérifications

- suite dashboard : 99/99 tests réussis ;
- tests ciblés iNrAgent, iNrSend et sécurité publication : 12/12 réussis ;
- tests pipeline image ciblés : 4/4 réussis ;
- transpilation syntaxique TypeScript/TSX des fichiers modifiés : réussie ;
- `package.json` et `package-lock.json` inchangés.
