# Hotfix Booster — préparation média avant génération

Date : 30 juillet 2026

Le correctif ferme trois causes communes du blocage après insertion d'images ou
de vidéo :

1. la confirmation finale de l'upload Supabase est désormais obligatoire et
   retentée ; le client ne considère plus un média comme prêt si le registre
   serveur n'a pas confirmé l'événement `uploaded` ;
2. le polling de préparation n'émet plus une URL signée par média toutes les
   1,2 seconde ; les URLs ne sont générées que lors de la restauration réelle
   d'un brouillon ;
3. le bouton Générer déclenche maintenant un rattrapage authentifié du workspace
   et peut lancer les workers Sharp / FFmpeg immédiatement, sans attendre le
   prochain cron ;
4. un upload déjà terminé dans Supabase mais resté bloqué en `pending` ou
   `uploading` est reconnu grâce à la taille réelle de l’objet, puis réparé sans
   demander un nouvel envoi au navigateur.

Aucune source lourde n'est renvoyée au serveur Next.js depuis le navigateur :
les fichiers continuent d'être uploadés directement vers le bucket privé
Supabase, puis les workers les relisent depuis ce stockage.
