# iNr'Search — Gravity Engine

Cette version transforme la fiche entreprise en neuf univers complémentaires. Chaque donnée n'a qu'un rôle visuel principal afin d'éviter les répétitions, les cartes superposées et l'effet « annuaire classique ».

## Les neuf univers

1. **Identité — Noyau vivant**  
   Promesse, activité, preuves et appel à l'action. Les coordonnées détaillées restent réservées à Contact.

2. **Expertises — Accélérateur de savoir-faire**  
   Une prestation active au centre, les autres sur une trajectoire claire et sélectionnable, sans collision.

3. **Réalisations — Observatoire créatif**  
   Un visuel principal, son contexte et une seule réglette de miniatures. Aucun empilement d'images identiques.

4. **Actualités — Générateur d'impulsions**  
   Une publication vedette, deux signaux secondaires et une chronologie. Un état élégant est prévu avant la première publication Booster Publier.

5. **Zone — Radar d'intervention**  
   Le radar est utilisé uniquement là où il apporte du sens : le point d'ancrage, les villes desservies et la zone active.

6. **Confiance — Balance de Newton**  
   Les points forts deviennent des forces en mouvement. L'iNrBadge et son QR Code forment la preuve vérifiable de cet univers.

7. **FAQ — Centre de réponses**  
   Trois cartes occupent la largeur : précédente, réponse active et suivante. Le contenu reste lisible et exploitable par les moteurs.

8. **Réseaux — Système solaire numérique**  
   Les sept canaux restent visibles, espacés et animés sur une orbite synchronisée. Le survol ou le focus met une planète en avant.

9. **Contact — Générateur de convergence**  
   Quatre voies fixes alimentent le noyau central : appeler, écrire, localiser et visiter le site. Aucun faux radar ni répétition des réseaux.

## Principes conservés

- rendu serveur et HTML complet pour les moteurs de recherche et les moteurs IA ;
- données structurées LocalBusiness, Breadcrumb, FAQ et BlogPosting ;
- navigation par swipe, clavier, molette et ancres ;
- responsive mobile, réduction des mouvements, contraste forcé et version imprimable ;
- données issues du profil iNrCy, d'iNrBadge, de la médiathèque et de Booster Publier ;
- suivi des actions dans iNr'Stats et formulaire iNr'Search vers le CRM.

## Prévisualisation locale

Après installation des dépendances, lancer l'application en développement puis ouvrir :

`/entreprises/demo-gravity-engine`

Cette démonstration locale est désactivée automatiquement en production.

## Finitions V2.1

- Identité recentrée : noyau à droite, informations en orbite sans chevauchement et résumé visible par défaut.
- Typographies renforcées sur Expertises, Zone, FAQ, Réseaux et Contact.
- Tous les appels à l’action de prise de contact ouvrent la modale « Présenter mon besoin ».
- Balance de Newton reconstruite avec trois sphères iNrCy, fils réalistes et transfert d’énergie animé.
- Rotation des réseaux continue, y compris au survol et au focus.
- Swipe volontairement moins sensible et clairement séparé du scroll vertical.
- Mobile et tablette : chaque univers reste un chapitre horizontal, mais devient une page verticale scrollable et correctement cadrée.
- Liens légaux isolés du curseur inférieur et protégés contre les clics déclenchés par un geste.

## Certification

La commande `npm run qa:inr-search:final` valide les contrôles iNr'Search, TypeScript et ESLint. Cette livraison passe **99 contrôles fonctionnels**, sans erreur TypeScript ni erreur ESLint.
