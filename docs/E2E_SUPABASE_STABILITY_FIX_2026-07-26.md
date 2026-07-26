# Correctif E2E et bruit Supabase — 26 juillet 2026

- Bypass des verrous d’onboarding uniquement sur le serveur Playwright dédié (`E2E_BYPASS_REQUIRED_SETUP=true`).
- Les routes Booster, Devis et Factures restent verrouillées normalement en production.
- Marqueur E2E stable ajouté sur « Votre intention ».
- Anti-tempête partagé entre onglets pour les appels `/auth/v1/user` après session expirée.
- Retry borné sur les signatures Storage pour absorber un 5xx transitoire.
- Dimensions explicites des logos pour supprimer les warnings Next/Image.

Les anciennes lignes déjà présentes dans Supabase ne sont pas effacées : le correctif évite leur répétition côté application.
