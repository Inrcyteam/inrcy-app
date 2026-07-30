# Base stable — changements sans risque fonctionnel

Date : 30 juillet 2026

Base utilisée : `inrcy-app-etats-dashboard-stables(1).zip`.

Ce lot ne modifie aucune logique métier, aucun flux réseau, aucune route API,
aucun traitement média, aucune configuration Supabase et aucune variable Vercel.

Modifications incluses :

- suppression de l’option Node non reconnue `--test-isolation=none` dans deux
  commandes de tests uniquement ;
- ajout de l’Étape 10 au registre documentaire `ops/MIGRATIONS.md` ;
- correction de trois textes UTF-8 mal encodés dans `proxy.ts`, sans modification
  des conditions ni des réponses HTTP ;
- ajout de la présente note de traçabilité.

Éléments volontairement laissés intacts :

- `.github/workflows/ci.yml` ;
- pipeline média et vidéo ;
- génération IA et fallbacks ;
- publication immédiate et programmation ;
- workers, crons et files de traitement ;
- SQL et schéma Supabase ;
- variables d’environnement ;
- dépendances et `package-lock.json`.

Le ZIP source doit rester archivé pour permettre un retour arrière immédiat.
