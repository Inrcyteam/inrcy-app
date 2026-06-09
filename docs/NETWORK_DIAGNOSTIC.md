# Diagnostic réseau iNrCy

Page ajoutée : `/diagnostic`

Objectif : aider à identifier les blocages sur les postes professionnels sécurisés
(AXA, banques, assurances, grands groupes, etc.) sans modifier l'application.

## Ce que la page teste

- Navigateur et état réseau déclaré.
- localStorage.
- Cookies first-party.
- API iNrCy same-origin (`/api/network/diagnostic/ping`).
- Supabase côté serveur Vercel (`/api/network/diagnostic/server`).
- Supabase direct depuis le navigateur.
- Supabase via la couche compatibilité iNrCy.
- Storage Supabase direct et via iNrCy.

## Sécurité

- Aucune écriture Supabase.
- Aucun envoi mail automatique pendant les tests ; un mail est envoyé seulement si le client clique sur **Envoyer à iNrCy**.
- Aucun appel Stripe.
- Aucune clé `service_role` exposée.
- Les tests utilisent uniquement les variables publiques déjà nécessaires au client.
- Les routes répondent avec `cache-control: no-store`.

## Utilisation client

Demander au client d'ouvrir :

```txt
https://app.inrcy.com/diagnostic
```

Puis demander une capture ou le bouton “Copier le rapport”.

## Envoi du rapport à iNrCy

La page `/diagnostic` propose aussi un bouton **Envoyer à iNrCy**.

- Route utilisée : `/api/network/diagnostic/send-report`
- Destinataire par défaut : `contact@inrcy.com`
- Destinataire personnalisable : variable `INRCY_DIAGNOSTIC_REPORT_TO`
- Envoi via le SMTP transactionnel existant : `TX_SMTP_HOST`, `TX_SMTP_PORT`, `TX_SMTP_USER`, `TX_SMTP_PASS`, `TX_MAIL_FROM`
- Données envoyées : nom, société, téléphone, message libre, résumé du diagnostic, user-agent, URL et rapport technique.
- Aucune écriture Supabase, aucun appel Stripe, aucune modification utilisateur.

Si l'envoi est bloqué côté poste client ou si le SMTP transactionnel n'est pas configuré, le bouton **Copier le rapport** reste disponible en secours.

## Depuis la page de connexion

La page de connexion peut afficher le bouton **Diagnostiquer l'erreur** uniquement pour les erreurs techniques :

- serveur iNrCy inaccessible ;
- blocage réseau / navigateur ;
- session validée mais non conservée par le navigateur ;
- erreur technique inconnue.

Le bouton ouvre :

```txt
/diagnostic?from=login&reason=network
```

ou :

```txt
/diagnostic?from=login&reason=technical
```

Les cas fonctionnels ne déclenchent pas ce diagnostic :

- identifiants incorrects ;
- lien expiré / envoi limité ;
- compte reconnu mais abonnement/essai bloquant, qui continue d'utiliser la page `/compte-bloque` existante.

Aucun mot de passe, token ou donnée sensible n'est transmis à la page diagnostic. Le contexte `from=login` sert seulement à indiquer dans le rapport que le client était bloqué sur la page de connexion.
