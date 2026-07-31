# Allègement — Étape 8 — Audit de la création de facture

Date : 31 juillet 2026

## Objet

Auditer la page de création de facture sans déplacer, supprimer ou modifier une ligne de code applicatif.

## Périmètre

Fichier audité :

`app/dashboard/factures/new/page.tsx`

## Mesures

- 3 145 lignes.
- Le composant React commence à la ligne 85.
- 21 déclarations d’import.
- 13 imports relatifs aux composants et modules du Dashboard.
- 10 états React déclarés directement dans la page.
- 6 effets (`useEffect`).
- 1 calcul mémorisé (`useMemo`).
- Environ 20 fonctions ou gestionnaires nommés dans le composant.
- 3 appels `fetch`.
- 19 références au client ou aux chaînes Supabase.
- 2 scénarios E2E dédiés ouvrent directement `/dashboard/factures/new`.

## Modularisation déjà présente

La page s’appuie déjà sur onze fichiers spécialisés du domaine Documents :

- hooks partagés de l’éditeur ;
- utilitaires de calcul des lignes et totaux ;
- règles de l’éditeur de facture ;
- types et helpers partagés ;
- snapshots de modèles ;
- impression ;
- section contact ;
- parties client/prestataire ;
- sections avancées ;
- paramètres iNrDocuments ;
- textes de communication client.

Les fichiers du dossier `_documents` représentent déjà environ 2 498 lignes de logique et de composants partagés. La mutualisation entre factures et devis est donc déjà importante.

## Responsabilités encore regroupées dans la page

1. Initialisation du numéro, des dates et des paramètres de facture.
2. Sélection et préremplissage d’un contact CRM.
3. Gestion des adresses de facturation et de livraison.
4. Lignes, quantités, prix, TVA, remises et acomptes.
5. Mentions légales, pénalités et indemnité forfaitaire.
6. Chargement et application des paramètres iNrDocuments.
7. Sauvegarde, ouverture et suppression des brouillons.
8. Création et application des modèles.
9. Conversion d’un devis en facture.
10. Validation des champs et affichage des erreurs.
11. Impression et génération de l’aperçu PDF.
12. Upload du PDF dans le stockage iNrbox.
13. Ouverture de la composition d’email avec la facture jointe.
14. Ajout du client dans le CRM.
15. Rendu complet de l’éditeur et de l’aperçu imprimable.

## Absence de frontière sans risque

Contrairement à d’autres gros fichiers, il n’existe pratiquement aucun bloc autonome avant le composant : le composant commence à la ligne 85 et occupe tout le reste du fichier.

Les fonctions locales partagent directement :

- les états du formulaire ;
- les hooks documentaires ;
- le client Supabase ;
- le routeur ;
- les références DOM ;
- les paramètres iNrDocuments ;
- les données CRM ;
- les calculs de facture et le rendu imprimable.

Les extraire imposerait de créer de gros contrats de paramètres ou de déplacer des états et effets. Ce serait une véritable refactorisation, pas un allègement sans risque.

## Couverture disponible

Deux scénarios Playwright dédiés couvrent la page :

- ouverture et création d’une facture ;
- contrôle des nouvelles pages Documents.

Ils ne peuvent pas être exécutés dans cette archive autonome, car `node_modules`, le navigateur Playwright et une application démarrée ne sont pas fournis. Huit tests statiques de contrôle d’accès au Dashboard ont en revanche réussi.

L’absence de tests unitaires dédiés aux calculs et aux fonctions locales de cette page rendrait un déplacement de code encore moins compatible avec l’exigence « zéro risque ».

## Décision

Aucune extraction n’est réalisée dans la série « strictement sans risque ».

La page est volumineuse, mais utilise déjà de nombreux modules partagés. Le volume résiduel correspond à l’orchestration complète de l’éditeur de facture et à son rendu. Un futur découpage nécessiterait des tests unitaires dédiés aux calculs, sauvegardes, conversions, modèles, PDF et emails avant toute modification.

## Certification exécutée

- 8 tests statiques de contrôle d’accès réussis sur 8.
- 12 audits transverses réussis sur 12.
- Aucun fichier applicatif modifié.
- Aucun import modifié.
- Aucun asset supprimé.
- Seul ce rapport d’audit a été ajouté pour l’étape 8.

## Conclusion

La page de création de facture ne présente pas de frontière extractible à risque nul. Dans le cadre strict demandé, le choix correct est de la conserver intacte.
