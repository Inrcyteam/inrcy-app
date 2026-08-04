# Booster Publier - Etape 4

Le moteur final IA/Manuel applique maintenant une decision idempotente unique :

1. variante deja prete -> reutilisation ;
2. preparation en cours -> attente ;
3. original compatible -> envoi de l'original ;
4. original incompatible -> preparation minimale ;
5. impossible -> blocage du seul canal concerne.

La publication immediate ne genere aucun encodage lourd. Elle lit le cache de variantes et valide d'abord la source originale pour chaque canal. Une variante n'est plus exigee simplement parce que la destination est un reseau externe. Les controles de duree, format, codec, poids et dimensions restent appliques canal par canal. Pinterest reste gere par ses politiques centralisees existantes. Les nouvelles tentatives, le suivi et l'annulation ne sont pas modifies.
