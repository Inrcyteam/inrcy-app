# Vidéo — Étape 12 — Contrôle avant tests

Contrôles réalisés avant livraison :

- Décompression complète du zip étape 11.
- Installation des dépendances via `npm ci` dans l'environnement de contrôle.
- Contrôle TypeScript via `npm run typecheck`.
- Contrôle ESLint via `npm run lint`.
- Vérification des routes vidéo : transformation, nettoyage stockage, publication.
- Vérification du flux Booster : choix vidéo par canal, variantes, préparation, brouillons.
- Vérification du flux iNrSend : détail vidéo finale, source conservée, format/adaptation.

Corrections appliquées pendant le contrôle :

- Correction d'une condition JSX incomplète dans `MailboxDetailsModal.tsx`.
- Correction de l'option `fallbackMessage` en `fallback` dans `/api/booster/video-storage-cleanup`.
- Restauration de helpers éditeur manquants dans `PublishModal.tsx` : sanitisation des posts, truncation et simplification des labels de canal.
- Correction de l'ordre de déclaration de `selectedDraftChannels` lors de la reprise d'un brouillon.

Résultat :

- `npm run typecheck` : OK.
- `npm run lint` : OK.

Note : `npm run build` a été lancé mais l'étape Next.js `Creating an optimized production build...` n'a pas terminé dans le délai de contrôle du sandbox. Aucun message d'erreur applicatif n'a été retourné avant expiration du délai.
