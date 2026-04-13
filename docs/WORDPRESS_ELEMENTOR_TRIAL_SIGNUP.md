# Elementor → iNrCy trial signup

## Endpoint

`POST /api/public/trial-signup?token=YOUR_SECRET`

## Accepted fields

Recommended field names:

- `email`
- `first_name`
- `last_name`
- `company`
- `phone`
- `legal_form`
- `message`
- `consent`
- honeypot: `website`

The endpoint also accepts common French aliases like `nom`, `prenom`, `societe`, `telephone`.

## What the endpoint does

- creates a Supabase Auth invitation
- redirects the invite email to `/set-password?mode=invite`
- upserts the `profiles` row
- creates / refreshes the `subscriptions` trial row
- sends the internal admin alert email

## Recommended Elementor setup

Use an Elementor Pro Form widget with:

1. Fields
   - Prénom → `first_name`
   - Nom → `last_name`
   - Email → `email`
   - Société → `company`
   - Téléphone → `phone`
   - Forme juridique → `legal_form`
   - Commentaire (optional) → `message`
   - Consent checkbox → `consent`
   - Hidden honeypot → `website`

2. Actions After Submit
   - `Webhook`
   - optional: `Email` to your sales inbox

3. Webhook URL
   - `https://app.inrcy.com/api/public/trial-signup?token=YOUR_SECRET`

4. Success message
   - `Invitation envoyée. Vérifiez votre boîte mail pour créer votre mot de passe et démarrer votre essai gratuit.`

## Supabase prerequisites

- the Auth email template / SMTP must already work
- `NEXT_PUBLIC_APP_URL` must point to the app URL
- the app redirect URL must be allowed in Supabase Auth URL configuration
