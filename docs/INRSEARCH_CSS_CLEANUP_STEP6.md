# Étape 6 — nettoyage CSS iNrSearch réellement obsolète

## Objectif

Supprimer uniquement les règles CSS qui ne peuvent plus être utilisées par les composants iNrSearch actuels, sans modifier le design, les boutons, les bordures, les positions, les animations encore actives ni les autres outils de l’application.

## Méthode de sécurité

Le nettoyage a été limité au fichier :

- `app/entreprises/[slug]/inrSearchPublic.module.css`

Pour chaque classe CSS du module, les composants TypeScript/TSX qui importent réellement cette feuille ont été analysés. Une règle n’a été supprimée que lorsque **toutes** les classes locales présentes dans son sélecteur étaient absentes du code source de la route.

Les accès dynamiques aux classes sociales (`styles[\`social_${...}\`]`) ont été détectés et toutes les variantes `social_*` ont été conservées.

Les règles mixtes contenant au moins une classe encore utilisée ont été conservées intégralement. Aucune déclaration isolée d’une classe active n’a été retirée.

## Nettoyage effectué

- 606 règles devenues inaccessibles supprimées.
- 156 anciennes classes réellement mortes retirées de leurs règles.
- 15 animations `@keyframes` supprimées uniquement après vérification qu’elles n’étaient plus référencées.
- 4 enveloppes `@media` devenues complètement vides supprimées.
- 83 123 octets de CSS obsolète retirés.
- Feuille réduite de 16 247 à 13 228 lignes.

Les suppressions concernent principalement les anciennes générations de mise en page antérieures au moteur orbital actuel : ancien hero, anciennes grilles de services, anciennes cartes d’actualités, ancienne galerie, ancien footer et anciens prototypes orbitaux qui ne sont plus rendus par aucun composant.

## Éléments volontairement conservés

- toutes les classes utilisées statiquement par les composants actuels ;
- toutes les classes sociales générées dynamiquement ;
- toutes les règles combinées contenant une classe active ;
- tous les correctifs mobiles des étapes 2 à 4 ;
- toutes les animations encore référencées ;
- tous les styles des autres outils et du Dashboard.

Deux références de classe (`areaSection` et `newsOrbitFocusVideo`) n’avaient déjà aucune règle CSS dans la version reçue avant cette étape. Elles n’ont donc pas été touchées par le nettoyage.

## Validation

- Analyse CSS : aucune erreur de syntaxe.
- Audit post-nettoyage : aucune règle entièrement composée de classes sans référence restante.
- QA iNrSearch : 106/106.
- Tests iNrSearch : 19/19.
- Stabilité mobile Dashboard : 3/3.
- Onboarding : 34/34.
- Multicompte : 54/54.
- Sécurité des contenus Booster : 6/6.
- Règles médias : 4/4.

Total ciblé : **120/120 tests réussis**, en plus des **106 contrôles QA iNrSearch**.

## Périmètre final

Un seul fichier applicatif a été modifié pendant l’étape 6 :

- `app/entreprises/[slug]/inrSearchPublic.module.css`

Aucun composant, aucune logique métier, aucune API, aucun autre module CSS et aucun fichier existant n’ont été supprimés.
