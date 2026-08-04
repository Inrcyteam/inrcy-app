# Booster Publier — Étape 1 : choix explicite du mode de création

Date : 4 août 2026

## Objectif

Installer le nouveau contrat d’interface de Booster Publier sans dupliquer ni réécrire le moteur de publication :

1. le professionnel sélectionne ses canaux ;
2. il choisit durablement `Créer avec iNrCy` ou `Créer manuellement` ;
3. l’interface affiche uniquement la branche correspondante ;
4. les deux branches rejoignent le moteur Publier commun déjà en place.

Cette étape ne modifie pas encore l’orchestration profonde du pipeline média. Elle prépare explicitement les étapes suivantes.

## Changements livrés

### Nouveau bloc 2 permanent

- Deux choix visibles : `Créer avec iNrCy` et `Créer manuellement`.
- Le choix est impossible tant qu’aucun canal n’est sélectionné.
- Le mode actif reste visible et identifiable.
- Le bouton Réinitialiser est centralisé dans ce bloc.

### Véritable état métier

Un type partagé a été ajouté :

```ts
type BoosterCreationMode = "ai" | "manual";
```

Le mode est :

- restauré depuis les brouillons récents ;
- inféré proprement pour les anciens brouillons qui ne possèdent pas encore ce champ ;
- sauvegardé dans les brouillons ;
- transmis aux publications immédiates et programmées pour préparer les prochaines étapes de l’orchestration.

### Parcours et numérotation

Parcours IA :

- 1 Canaux
- 2 Mode de création
- 3 Votre intention
- 4 Contenus par canal
- 5 Médias de la publication
- 6 Aperçu

Parcours manuel :

- 1 Canaux
- 2 Mode de création
- 3 Contenus par canal
- 4 Médias de la publication
- 5 Aperçu

La présentation numérotée auparavant dupliquée dans plusieurs composants est maintenant centralisée dans `PublishStepTitle`.

### Changement de mode sécurisé

- Aucun avertissement lorsqu’aucun travail propre au mode courant n’existe.
- Avertissement explicite lorsqu’un changement supprimerait une intention IA ou des textes saisis/générés.
- Les canaux et les médias restent conservés.
- Seul le travail appartenant à la branche abandonnée est nettoyé.

### Nettoyage du code obsolète

Suppression du bloc IA de :

- l’ancien bouton `Créer manuellement` ;
- son callback `onCreateManually` ;
- l’ancien bouton Réinitialiser local ;
- plusieurs props média qui étaient reçues puis ignorées ;
- la prop `publicationMediaType` inutilisée dans `PublishImagesPanel` ;
- les répétitions du composant visuel de numéro d’étape.

### Corrections de régression conservatrices

- Un retrait de média pour un canal ne désélectionne plus entièrement le canal : le mode média explicite `none` est respecté et la validation du canal explique ensuite ce qui manque.
- Le préremplissage CTA ne dépend plus de chaque frappe dans les contenus, ce qui évite une nouvelle normalisation permanente pendant la saisie.

## Ce qui ne change pas dans cette étape

- un seul moteur final Publier ;
- les règles de durée vidéo ;
- la validation par canal ;
- Pinterest et ses carrousels ;
- les règles d’images et de vidéos ;
- les publications immédiates et programmées ;
- les nouvelles tentatives et les statuts.

## Certification exécutée

- Dashboard / Booster : 118 tests réussis
- Système de publication : 85 tests réussis
- Pinterest : 21 tests réussis
- Décisions image TypeScript : 18 tests réussis
- Décisions image JavaScript et règles média : 31 tests réussis
- Workspace progressif IA/publication : 5 tests réussis

Total : **278 tests réussis, 0 échec**.

Une transpilation syntaxique TypeScript/TSX ciblée a également été exécutée sur tous les fichiers modifiés.

## Limitation de l’environnement de contrôle

Le `npm ci` complet n’a pas pu aboutir dans l’environnement d’audit : le lockfile référence une archive de dépendance indisponible (réponse 404), puis le registre public a expiré lors des tentatives de repli. Par conséquent, `npm run typecheck`, `npm run lint` et `npm run build` complets devront être rejoués dans l’environnement habituel du projet disposant des dépendances.
