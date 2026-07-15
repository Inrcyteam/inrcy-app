# iNrAgent Lot A — contexte de génération partagé

## Objectif

iNrAgent utilise désormais le même chargeur de contexte serveur que Booster / Publier pour :

- le profil professionnel ;
- l’activité et la configuration IA ;
- les cinq publications récentes.

## Fonctionnement

- lecture prioritaire des caches Redis Booster existants ;
- isolation par établissement actif (`userId`) ;
- chargement Supabase parallèle et automatique lorsque le cache est absent ;
- invalidations existantes partagées après modification du profil, de l’activité ou des publications ;
- Supabase reste la source de vérité et le fallback complet.

Le chargement du contexte est lancé en parallèle de la sélection des canaux iNrAgent. Les logs `prepare-publish timing` exposent maintenant `generationContextMs`, `professionalContextSource` et `publicationsContextSource`.

Aucun prompt, média, moteur, quota ou contrôle qualité n’est modifié.
