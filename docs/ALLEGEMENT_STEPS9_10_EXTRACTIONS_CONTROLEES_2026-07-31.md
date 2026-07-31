# Allègement — Étapes 9 et 10 — Extractions contrôlées

Date : 31 juillet 2026

## Objectif

Réduire la taille des deux composants sans modifier leur logique, leur rendu, leurs appels réseau ou leur ordre d’exécution.

## Étape 9 — Dashboard

- `app/dashboard/DashboardClient.tsx` : 4 077 → 3 761 lignes.
- Nouveau module : `app/dashboard/dashboard.bootstrap-cache.ts` (362 lignes).
- Déplacement mécanique des clés, types, validateurs et helpers de cache/démarrage.
- Les protections fail-closed de Site iNrCy et les caches multicompte restent inchangés.
- Aucun hook, JSX, appel réseau ou accès Supabase n’a été déplacé.

## Étape 10 — Détails iNrSend

- `app/dashboard/mails/_components/MailboxDetailsModal.tsx` : 2 472 → 2 165 lignes.
- Nouveau module : `app/dashboard/mails/_lib/mailboxDetails.foundations.ts` (326 lignes).
- Déplacement mécanique des types de props et helpers purs : campagnes, pièces jointes vidéo, erreurs visibles, TikTok et YouTube.
- Aucun état React, effet, JSX, appel API ou action de publication n’a été déplacé.

## Garanties de comparaison

Les deux blocs déplacés ont été comparés avec leur source d’origine : les instructions runtime sont strictement identiques. Les seules adaptations sont les mots-clés `export`, les imports nécessaires et le remplacement type-only de `React.Dispatch<React.SetStateAction<...>>` par les alias importés équivalents.

## Tests

- 185/185 : Dashboard, onboarding, multicompte, observabilité et profil.
- 33/33 : iNrSend.
- 50/50 : TikTok et pipeline d’images lié.
- 688/688 tests Node exécutables sur l’ensemble du dépôt.
- 12/12 audits transverses réussis.
- 38/38 contrôles Pinterest Standard réussis.
- 9 fichiers modifiés ou ajoutés analysés syntaxiquement par TypeScript sans erreur.

Trois fichiers de tests binaires n’ont pas pu démarrer localement faute de dépendances installées (`sharp` et `bmp-js`), soit huit tests. L’installation complète est bloquée par une archive npm absente du registre interne. La CI doit donc confirmer le lint, le typecheck, le build et ces tests binaires.

## Résultat

Les deux gros composants perdent ensemble 623 lignes. Il s’agit d’un allègement structurel : le code est déplacé vers des modules spécialisés, pas supprimé.
