# YouTube Shorts — Étape 4 — iNrSend

## Objectif
Afficher proprement dans iNrSend les publications YouTube Shorts envoyées depuis Booster.

## Comportement
- Le résultat YouTube enregistré par Booster contient `external_id` et `external_url`.
- iNrSend lit déjà `payload.results.youtube_shorts` depuis `app_events`.
- Le détail iNrSend affiche maintenant un bouton **Voir le Short** pour ouvrir la vidéo YouTube publiée.
- YouTube Shorts est traité comme TikTok côté historique : iNrSend conserve le statut et le lien, mais la modification / suppression réelle reste à faire dans YouTube Studio pour cette étape.

## Données attendues dans `payload.results.youtube_shorts`
```json
{
  "ok": true,
  "external_id": "VIDEO_ID",
  "external_url": "https://www.youtube.com/shorts/VIDEO_ID",
  "privacy_status": "public"
}
```

## Fichiers modifiés
- `app/dashboard/mails/_components/MailboxDetailsModal.tsx`
- `app/dashboard/mails/_lib/mailboxPhase1.tsx`
