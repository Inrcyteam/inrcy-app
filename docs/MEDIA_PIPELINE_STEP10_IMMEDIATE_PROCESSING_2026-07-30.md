# Pipeline média — déclenchement immédiat depuis Booster

## Incident corrigé

Après l’upload, Booster restait à 32 % car il attendait que les crons de normalisation traitent la file. Le cron image ne prenait que deux éléments par minute, alors que Booster autorise cinq images et abandonnait avant trois passages complets.

## Correction

- Générer, Publier et Programmer déclenchent maintenant une route authentifiée de traitement du workspace.
- La route ne traite que les médias de l’établissement et du workspace demandés.
- Les jobs sont revendiqués de manière ciblée avec verrou optimiste pour cohabiter avec les crons `SKIP LOCKED`.
- Jusqu’à cinq images sont préparées immédiatement, par lots de deux pour contenir la mémoire Sharp.
- Une vidéo est préparée immédiatement avec le worker FFmpeg existant.
- Les crons restent actifs comme filet de sécurité en cas de coupure ou de fonction interrompue.
- La progression n’est plus figée à 32 % : Booster affiche le nombre de médias prêts et la progression réelle du worker.
- Les erreurs terminales sont remontées sans attendre tout le timeout.

## Déploiement

Aucun SQL et aucune variable Vercel supplémentaires. Le binaire FFmpeg est embarqué sur la nouvelle route via `vercel.json`.
