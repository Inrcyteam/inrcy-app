# Version fusionnée iNrCy

Cette archive fusionne :

- le ZIP iNrSearch d’origine ;
- la version actuelle avec l’annuaire iNrCy.

Les fichiers présents dans l’archive d’origine mais absents de la version actuelle ont été réinjectés. Aucun fichier d’origine n’est volontairement supprimé dans cette fusion.

## Utilisation recommandée

Décompresser cette archive dans un nouveau dossier de travail, ou par-dessus une copie de sauvegarde du projet. Ne pas supprimer le dossier Git existant avant comparaison.

Puis exécuter :

```powershell
npm ci
npm run typecheck
npm run build
```

Le dossier `node_modules` et le dossier `.next` ne sont pas inclus : ils sont recréés par les commandes ci-dessus.
