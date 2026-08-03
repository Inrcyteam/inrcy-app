# Booster - Etape 2 corrigee : preparation video par canal

Date : 2026-07-30

## Objectif

Empêcher l'envoi d'une vidéo réellement incompatible, sans imposer une compression sous 40 Mo à tous les réseaux.

## Regles retenues

- La source reste acceptée jusqu'à 300 Mo.
- Un MP4/M4V déjà compatible peut rester utilisé au-dessus de 40 Mo.
- Les variantes sont contrôlées canal par canal : format, taille connue et durée.
- TikTok est bloqué au-delà de 10 minutes avant l'envoi, puis la limite propre au compte est encore vérifiée via Creator Info.
- Instagram est contrôlé entre 3 secondes et 15 minutes.
- LinkedIn est contrôlé entre 3 secondes et 30 minutes.
- Pinterest est contrôlé entre 4 secondes et 15 minutes pour l’épingle vidéo standard publiée par l’API (`video_id`). La limite de 5 minutes concerne les Idea Ads et ne doit pas bloquer ce flux.
- Facebook est contrôlé jusqu'à 4 heures.
- YouTube accepte aussi les vidéos longues : elles sont publiées comme vidéo classique lorsqu'elles ne sont pas éligibles au format Short.
- Aucun connecteur n'est artificiellement plafonné à 40 Mo. Le plafond technique iNrCy reste 300 Mo.

## Securite conservee

- Une variante demandée doit être réellement prête avant la publication.
- Aucun retour silencieux vers une source incompatible.
- Les erreurs indiquent désormais le canal et la vraie cause : variante absente, format, taille ou durée.
- La publication et la programmation attendent la préparation des variantes demandées.

## Deploiement

Aucune migration SQL et aucune nouvelle variable d'environnement.
