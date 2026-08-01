# Médias Original First sans fond flouté — 2026-08-01

## Règle produit verrouillée

Pour les images et vidéos de tous les canaux :

1. publier le média original dès que le canal l'accepte ;
2. effectuer uniquement une optimisation technique invisible si nécessaire (orientation, codec, conteneur, poids, dimensions maximales), sans modifier le ratio ni le cadrage ;
3. adapter le média seulement lorsqu'une contrainte réelle du canal l'impose ;
4. utiliser en dernier recours un filet de sécurité uni blanc, noir ou transparent selon le canal ;
5. considérer le média comme Personnalisé uniquement lorsque le professionnel valide une modification dans Adapter.

## Interdiction du flou

Aucun fond flouté n'est généré :

- ni par Sharp pour les images ;
- ni par Canvas dans les aperçus ;
- ni par FFmpeg pour les vidéos ;
- ni dans Booster, iNrAgent ou iNrSend.

Les anciens réglages persistés `blur`, `blurBackground` ou `safe_blur` sont migrés vers un filet de sécurité uni. Ils ne peuvent pas recréer un fond flouté.

## Filet de sécurité

- Site iNrCy, site connecté et iNrSearch : transparence lorsque le format le permet.
- Google Business : fond blanc opaque.
- Réseaux sociaux : fond noir sobre dans les rares cas où une toile imposée est indispensable.
- Vidéo MP4/H.264 : transparence non conservable ; le filet utilise donc blanc ou noir selon le canal.

Les variantes de publication image et vidéo utilisent la génération de cache v4 afin de ne pas réutiliser d'anciennes sorties floutées.
