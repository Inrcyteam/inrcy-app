# Protection multicompte (Google RISC) — V1 safe

Cette V1 ajoute une **brique backend passive et défensive** pour la Protection multicompte Google.

## Ce que fait la V1

- ajoute un endpoint HTTPS : `POST /api/security/google/risc`
- valide les **Security Event Tokens** Google (JWT signés)
- vérifie l'émetteur et l'audience OAuth Google
- journalise les événements reçus
- en cas d'événement critique, **coupe localement** les intégrations Google concernées en les forçant en reauth

## Ce que la V1 ne fait pas

- n'enregistre pas automatiquement le receiver auprès de Google
- ne crée pas automatiquement le service account RISC
- ne modifie pas l'UI
- ne touche pas aux callbacks OAuth existants

## Variables d'environnement

- `GOOGLE_RISC_RECEIVER_ENABLED=1`
- `GOOGLE_CLIENT_ID=...`
- optionnel : `GOOGLE_RISC_AUDIENCES=client_id_1,client_id_2`

## Flux recommandé

1. déployer ce code
2. créer la table `security_events_google` (optionnel mais recommandé)
3. activer l'API RISC côté Google
4. créer le service account RISC
5. enregistrer le receiver `https://<ton-domaine>/api/security/google/risc`
6. envoyer un événement de vérification

## Réponse locale aux événements critiques

Événements traités en mode défensif :

- sessions revoked
- tokens revoked
- account disabled
- account credential change required

Action locale :

- `status = expired`
- `access_token_enc = null`
- `refresh_token_enc = null`
- drapeau `meta.risc.reauth_required = true`

L'objectif est de **ne rien casser dans l'app** tout en empêchant la réutilisation silencieuse de jetons devenus douteux.
