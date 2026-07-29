# Pipeline média universel — Étape 8 — Bascule hors des transports historiques

Date : 29 juillet 2026

## Objectif

Faire du workspace média persistant la seule source active de Générer, Publier,
Programmer et des brouillons, sans renvoyer les images, vidéos, captures ou
pistes audio du navigateur vers les anciennes routes Booster.

L'étape reste réversible : les anciens transports sont encore présents dans le
code, mais uniquement dans la branche exécutée lorsque les flags Étape 8 sont
coupés. Leur suppression physique éventuelle ne doit intervenir qu'après la
certification finale et une période d'observation en production.

## Nouveau parcours actif

### Générer

Le navigateur transmet :

- `mediaWorkspaceId` ;
- le texte et les options de génération ;
- `mediaPipelineCutoverV1: true`.

Il ne transmet plus :

- `imagesForAI` ;
- les captures vidéo encodées côté client ;
- la piste audio ou une transcription préparée côté client.

Le serveur relit les aperçus IA, captures et piste audio depuis le registre. En
mode strict, l'absence ou l'indisponibilité du workspace produit une erreur
explicite et ne déclenche pas silencieusement l'ancien transport.

### Publier et Programmer

Le navigateur transmet :

- l'identifiant du workspace ;
- l'ordre des médias ;
- le mode média par canal ;
- les choix de format, cadrage et adaptation ;
- les contenus textuels.

Le serveur :

- télécharge les sources privées depuis leur véritable bucket ;
- recrée les images adaptées avec Sharp ;
- recrée les variantes vidéo avec le moteur FFmpeg commun ;
- conserve les adaptations spécifiques aux connecteurs ;
- poursuit le cycle `ready → scheduled/publishing → published` ou `failed`.

Les programmations historiques déjà enregistrées sans marqueur Étape 8 restent
compatibles : elles continuent d'utiliser leur ancien payload.

### Brouillons

Un brouillon Étape 8 conserve la référence du workspace sans réuploader les
mêmes fichiers. À la réouverture, Booster demande une vue signée du workspace et
reconstruit la galerie avec la clé média d'origine, les dimensions, la durée et
l'ordre.

## Conservation des cadrages

`client_media_key` est relu depuis `pro_media_library` et converti vers la clé
d'édition utilisée par Booster. Les réglages de cadrage restent donc attachés à
la bonne image, y compris après fermeture et reprise d'un brouillon.

## Sécurité et isolation

- toutes les lectures restent limitées à `account_id` ;
- les sources originales et canoniques restent privées ;
- les URL signées de restauration sont temporaires ;
- les noms de bucket et chemins sont normalisés avant lecture ;
- le serveur échoue fermé lorsque le client demande explicitement la bascule
  mais que le workspace est absent ou non prêt ;
- aucune migration destructive n'est incluse.

## Flags

La bascule serveur exige :

```text
MEDIA_PIPELINE_UPLOADS_V1=true
MEDIA_PIPELINE_WORKSPACE_V1=true
MEDIA_PIPELINE_IMAGE_NORMALIZATION_V1=true
MEDIA_PIPELINE_VIDEO_NORMALIZATION_V1=true
MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1=true
MEDIA_PIPELINE_LEGACY_CUTOVER_V1=true
```

La bascule client exige :

```text
NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1=true
NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1=true
NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1=true
NEXT_PUBLIC_MEDIA_PIPELINE_LEGACY_CUTOVER_V1=true
```

## Ordre de déploiement prévu

Ne pas activer cette étape isolément avant la certification finale.

1. appliquer les migrations Étapes 2 à 8 dans l'ordre ;
2. déployer le code final ;
3. vérifier les scripts SQL de lecture seule ;
4. activer d'abord les flags serveur des étapes précédentes ;
5. certifier uploads, normalisations et consommation unifiée ;
6. activer les deux flags Étape 8 lors de la bascule contrôlée.

## Retour arrière

Le rollback ne nécessite ni SQL inverse ni suppression de données :

```text
MEDIA_PIPELINE_LEGACY_CUTOVER_V1=false
NEXT_PUBLIC_MEDIA_PIPELINE_LEGACY_CUTOVER_V1=false
```

Après redéploiement des variables, Booster reprend les transports historiques
encore présents. Les workspaces, médias originaux et variantes déjà créés restent
conservés pour une nouvelle activation.

## Validation attendue

- Générer n'envoie aucun média binaire en mode Étape 8 ;
- Publier et Programmer n'effectuent aucun upload média historique ;
- les cadrages et formats sont recréés côté serveur ;
- les brouillons se restaurent depuis le workspace ;
- une demande strictement marquée sans workspace échoue avec un code lisible ;
- le mode flag-off conserve le comportement historique ;
- Booster, Pinterest, TikTok, YouTube, iNrAgent et iNrSend restent non régressifs.
