# Dashboard onboarding — Étape 5 : cadenas explicatifs

Cette étape ajoute uniquement l'information visuelle du verrouillage déjà mis en place à l'étape 4.

## Comportement

- Sur ordinateur, le cadenas reste visible et le message apparaît au survol ou au focus clavier.
- Sur téléphone et tablette, un appui sur le cadenas affiche ou masque le message.
- Le cadenas n'ouvre aucun panneau, ne contient aucun lien et ne propose aucun bouton d'action.
- Un clic en dehors du message ou la touche Échap le ferme sur les écrans responsives.
- Les info-bulles sont rendues dans un portail afin de ne pas être coupées par les cartes rondes ou les capsules de la boîte de vitesse.

Message affiché :

> Mon profil et/ou Mon activité sont incomplets.

## Emplacements couverts

- Booster / Publier
- Propulser
- Fidéliser
- iNrSend, dans le pilotage, les bulles de canaux et les raccourcis
- Encaisser
- iNrAgent, dans le header, sa bulle et les raccourcis

Les cadenas ne s'affichent qu'une fois la vérification de complétion terminée. Ils disparaissent immédiatement dès que Mon profil et Mon activité sont complets pour l'établissement actif.

Aucune migration SQL supplémentaire n'est nécessaire.
