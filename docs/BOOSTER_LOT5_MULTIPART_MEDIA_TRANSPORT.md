# Booster / Publier - Lot 5 - Transport binaire des médias IA

## Objectif

Réduire le poids réseau et le coût de sérialisation de la génération avec photos ou captures vidéo, sans modifier les fichiers préparés, leur qualité, leur ordre ni le payload finalement reçu par le moteur IA.

## Implémentation

- Les générations sans média conservent le JSON historique.
- Les générations avec photos ou captures vidéo utilisent `FormData`.
- Le champ `payload` contient uniquement les métadonnées et le contexte texte.
- Les photos sont jointes sous `aiImage0` à `aiImage4`.
- Les captures vidéo sont jointes sous `videoFrame0` à `videoFrame2`.
- Les `dataUrl` Base64 sont retirées du JSON multipart avant l'envoi.
- Le serveur valide les types, tailles et quantités puis reconstruit les mêmes `dataUrl` avant les fonctions de sanitation et de génération existantes.
- Le parsing des photos et des captures est exécuté en parallèle.

## Fallback et compatibilité

- La route `/api/booster/generate` continue d'accepter intégralement l'ancien JSON Base64.
- Si le navigateur ne peut pas construire le multipart ou rencontre une donnée locale illisible avant l'envoi, il revient automatiquement au JSON historique.
- Aucune relance automatique n'est effectuée après le départ d'une requête, afin d'éviter une double génération ou une double réservation de crédits.
- Sans média, aucune construction multipart inutile n'est réalisée.

## Invariants de qualité

Aucune modification de :

- `fileToBoosterAiImagePayload`,
- résolution maximale de 1280 px,
- qualité JPEG de 0.76,
- nombre ou ordre des photos,
- positions et qualité des captures vidéo,
- transcription vidéo,
- prompts, modèles, tokens, longueurs, emojis,
- contrôles et réparations éditoriales.

Les tests vérifient que les octets envoyés en multipart sont reconstruits en une `dataUrl` strictement identique côté serveur.

## Observabilité

Les chronos de `/api/booster/generate` exposent désormais :

- `requestTransport` : `json` ou `multipart`,
- `requestParseMs`,
- `requestContentLength` lorsque l'en-tête est disponible.
