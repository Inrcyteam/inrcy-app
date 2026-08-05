# Correctifs Booster / TikTok — 3 août 2026

## Correctifs livrés

1. **Titres par canal**
   - La saisie conserve désormais les espaces et la position du curseur.
   - Le nettoyage CTA/téléphone n'est plus relancé après chaque caractère.
   - La sécurisation finale reste appliquée avant publication.

2. **Photos TikTok**
   - Variante TikTok dédiée en JPEG classique non progressif, qualité 90 et sous-échantillonnage 4:2:0.
   - Version du pipeline TikTok portée à 8 afin d'invalider les anciennes variantes progressives.
   - Les anciennes sources incompatibles sont converties une seule fois puis mises en cache dans le stockage.
   - L'URL média renvoie des octets stables avec `Content-Type`, `Content-Length` et cache cohérents.

3. **Suivi TikTok**
   - Arrêt terminal après 60 minutes sans finalisation (`PROCESSING_TIMEOUT`).
   - Aucune republication automatique afin d'éviter les doublons.
   - Les publications sans historique iNrSend deviennent des échecs terminaux au lieu de boucler.
   - Rotation des contrôles sur une fenêtre élargie et priorité aux publications les moins récemment vérifiées.
   - Enregistrement du nombre de contrôles, de la durée, de la progression et du dernier contrôle.

4. **Statuts iNrSend**
   - Un TikTok non terminal reste affiché **En traitement**, et non **Publié avec avertissement**.
   - Affichage du motif, du code TikTok, du dernier contrôle, des octets reçus/téléchargés, du nombre de vérifications et de la durée.

5. **Suppression vidéo dans le bloc 4**
   - Le bouton **Retirer du canal** est conservé.
   - Une corbeille permet désormais de supprimer la vidéo de toute la publication directement depuis le bloc 4.

## Validation

- 111 tests Dashboard : réussis.
- 52 tests iNrSend : réussis.
- 14 tests TikTok : réussis.
- 143 tests publication, sécurité et décision média : réussis.
- Total des suites ciblées : **320 tests réussis, 0 échec**.
- Analyse syntaxique/transpilation des 17 fichiers TypeScript modifiés : réussie.

Aucune dépendance n'a été ajoutée au ZIP. Le `npm ci` complet n'a pas pu être exécuté dans l'environnement d'audit, le miroir npm ayant renvoyé une erreur 404 sur une archive existante du lockfile.
