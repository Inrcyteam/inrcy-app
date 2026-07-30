# Booster — secours IA automatique au premier clic (2026-07-30)

## Incident observé

La préparation vidéo atteignait 98 %, puis `/api/booster/generate` pouvait renvoyer un 502 avec Mistral. Une seconde génération manuelle après changement de moteur fonctionnait, ce qui confirmait que le workspace vidéo, les captures et l'audio étaient valides et que l'échec était fournisseur.

## Correctif

- Les erreurs multimodales 400/409/422 spécifiques à un fournisseur deviennent éligibles au fallback Gateway.
- Pour une génération avec captures, iNrCy ne rejoue plus le même fournisseur avant de basculer vers un autre moteur.
- Si la route échoue malgré les secours serveur, le client effectue automatiquement une unique nouvelle requête propre :
  - ChatGPT -> Gemini ;
  - tout autre moteur -> ChatGPT.
- Le moteur par défaut enregistré par le professionnel n'est jamais modifié.
- Les erreurs de garde économique, d'authentification ou de limite compte ne provoquent pas de boucle de secours.
- L'interface affiche le moteur de secours utilisé.

## Résultat attendu

Un seul clic sur Générer suffit. Une panne ponctuelle de Mistral ne doit plus obliger le professionnel à changer manuellement de moteur et relancer.

## Validation

- 4 nouveaux tests ciblés réussis.
- 157/160 tests AI Gateway réussis ; les 3 échecs restants existaient déjà dans le ZIP étape 15 et sont sans lien avec ce correctif.
- 79/79 tests média JavaScript réussis.
- 34/34 tests média TypeScript réussis.
