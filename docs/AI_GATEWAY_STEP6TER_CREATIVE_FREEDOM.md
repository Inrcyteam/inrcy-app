# AI Gateway — Étape 6 ter : liberté créative multi‑IA

## Objectif

Préserver les contraintes dures iNrCy tout en évitant que les prompts, les CTA, les nombres de paragraphes, les quotas d'emojis ou les reprises qualité transforment les huit moteurs en une seule voix éditoriale.

## Nouvelle hiérarchie

### Règles dures

Restent obligatoires :

- vérité des faits et absence d'invention ;
- sécurité et conformité ;
- langue finale ;
- format JSON ;
- contraintes techniques des canaux ;
- consignes explicites du professionnel ;
- tutoiement/vouvoiement ;
- pronom choisi ;
- éléments « À éviter absolument ».

### Préférences souples

Orientent le contenu sans imposer un plan :

- ton ;
- style ;
- originalité ;
- longueur favorite ;
- niveau commercial ;
- angle ;
- emojis ;
- CTA préféré ;
- exemple de contenu aimé.

## Liberté native des huit moteurs

Le moteur actif est désormais transmis aux règles de rédaction partagées. ChatGPT, Claude, Gemini, Mistral, Grok, Perplexity, DeepSeek et Llama reçoivent explicitement l'autorisation de conserver leur propre jugement éditorial et de ne pas imiter une voix iNrCy uniforme.

La latitude varie aussi avec le réglage d'originalité : classique, équilibrée ou créative.

## Booster / Publier

- Les quantités de texte et budgets de sortie sont inchangés.
- Les fourchettes deviennent des zones de confort éditoriales, pas des gabarits de structure.
- Les vrais paragraphes et doubles retours à la ligne restent obligatoirement préservés.
- Le nombre de paragraphes n'est plus fixé à 2–4.
- Les emojis sont gérés comme une intensité, pas comme un quota numérique exact.
- Une accroche, une question, une liste ou un CTA séparé ne sont plus obligatoires.
- La clé JSON `cta` reste présente mais peut être vide lorsque le texte est meilleur sans CTA séparé.

## Reprises qualité

Un bon contenu n'est plus régénéré uniquement parce que :

- le CTA séparé est vide ;
- deux canaux partagent naturellement le vocabulaire du même sujet.

La reprise anti‑duplication est réservée aux copies exactes ou quasi identiques (seuil Jaccard renforcé à 0,92 avec ratio de longueur 0,86).

Les reprises restent actives pour les vrais défauts : contenu vide/cassé, réellement trop court, hors sujet, mauvaise langue, fuite méta/technique ou quasi copie.

## Emails et campagnes

Les générateurs Mails, Propulser, Fidéliser et iNrAgent Campagnes ne forcent plus systématiquement :

- salutation ;
- quatre blocs fixes ;
- CTA séparé ;
- formule de fin.

Le mail doit rester finalisé et prêt à envoyer, mais le moteur choisit la meilleure construction.

## Avis

Les réponses Google et Trustpilot restent concises et sûres, mais ne sont plus enfermées dans un nombre fixe de phrases. Les pistes anti-répétition Google deviennent facultatives.

## Validation

- 43/43 tests AI Gateway passent.
- Audit anti-contournement passe.
- TypeScript : 0 erreur.
- Les plafonds de génération restent inchangés (`booster.publish`, `agent.publish`, `booster.youtube-rescue` à 8000 tokens max par sous-appel selon la politique existante).
- Le build Next.js atteint `Creating an optimized production build...` mais dépasse 180 secondes dans l'environnement de validation ; il n'est donc pas déclaré validé.

## Infrastructure

Aucune nouvelle variable Vercel.

Aucun nouveau SQL Supabase.
