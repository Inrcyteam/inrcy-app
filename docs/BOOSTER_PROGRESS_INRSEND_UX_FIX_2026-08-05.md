# Booster — Progressions et bilan iNrSend (2026-08-05)

## Périmètre

Correctifs d'interface et d'état uniquement. Le moteur de publication, les workers, les connecteurs réseaux et la logique média restent inchangés.

## Changements

- Génération IA : progression continue de 1 à 100 %, phrases fixes par palier, 100 % uniquement lorsque les contenus sont prêts.
- Publication : progression continue de 1 à 100 %, conservation des libellés « Publication sur [canal]… ».
- Fenêtre de bilan : les 30 secondes sont comptées depuis le clic sur Publier ; sortie anticipée si tous les canaux terminent avant.
- Résultats : `queued` et `processing` s'affichent en orange sous le statut « Finalisation », jamais comme un échec.
- Bilan : suppression du grand message redondant ; les lignes et leur code couleur portent l'information principale.
- Navigation : « Voir dans iNrSend » effectue une seule navigation directe vers l'onglet Publications.
- iNrSend : le chargement d'une sauvegarde ou suppression est isolé au canal concerné.
- iNrSend : récupération renforcée de l'URL de la vidéo réellement publiée depuis URL publique, URL rendue ou URL de téléchargement Storage.

## Contrôles

- Tests dashboard : 146 réussis.
- Tests iNrSend et publication ciblée : 70 réussis.
- Tests publication et Pinterest : 114 réussis.
