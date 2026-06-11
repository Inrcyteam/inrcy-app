# iNr’Agent V2 — Étape 11 — Audit de contrôle

Comparaison effectuée entre le zip d’origine `inrcy-app(148).zip` et le zip de travail `inrcy-app-147-inragent-v2-etape10(1).zip`.

Cette étape ne change pas le fonctionnement métier. Elle ajoute ce rapport d’audit et nettoie un artefact local `tsconfig.tsbuildinfo` qui ne doit pas être livré.

## Résumé

- Fichiers ajoutés après audit : 20 (dont ce rapport).
- Fichiers modifiés : 18.
- Fichiers supprimés du zip d’origine : 0.
- Système manuel conservé : Booster, Propulser, Fidéliser et iNrSend continuent d’utiliser les routes/tables existantes.
- iNr’Agent ajoute une couche d’orchestration et d’origine, sans remplacer les parcours manuels.

## Contrôles réalisés

- Comparaison complète des arborescences et empreintes SHA-256.
- Vérification ciblée TypeScript des fichiers iNr’Agent/modifiés : pas d’erreur de syntaxe détectée.
- Le typecheck complet n’est pas possible dans le sandbox sans `node_modules`; les erreurs restantes du contrôle ciblé viennent des dépendances absentes et des types Node (`Buffer`).
- Deux nettoyages effectués pendant l’audit : typage explicite dans `prepare-publish` et typage du meta snapshot dans `dashboard-bulk`.
- Suppression de l’artefact local `tsconfig.tsbuildinfo`.

## Récapitulatif des étapes

- Étape 1 : Structure Supabase V2 : réglages globaux, automatisations séparées, actions avec payload.
- Étape 2 : Page iNr’Agent branchée aux réglages Supabase.
- Étape 3 : Actions préparées affichées dans iNr’Agent + Valider/Refuser.
- Étape 4 : Préparation réelle d’une publication Booster avec IA + banque d’images.
- Étape 5 : Validation iNr’Agent → exécution réelle Booster / Publier.
- Étape 6 : Préparation/exécution Propulser et Fidéliser via templates IA + CRM.
- Étape 7 : Bilan iNrStats PDF manuel envoyé au pro.
- Étape 8 : Cron automatique iNr’Agent avec anti-doublon.
- Étape 9 : Marquage iNr’Agent dans iNrSend sans créer d’historique séparé.
- Étape 10 : Garde-fous UI + compatibilité si SQL étape 9 non encore lancé.
- Étape 11 : Audit de contrôle + listing complet des fichiers touchés.

## SQL à lancer

- Obligatoire : `ops/SUPABASE_INR_AGENT_V2.sql`.
- Recommandé pour pastille iNr’Agent sur Propulser/Fidéliser : `ops/SUPABASE_INR_AGENT_ETAPE9_INRSEND_ORIGIN.sql`.
- Variable Vercel déjà compatible : `CRON_SECRET` ou `VERCEL_CRON_SECRET`.

## Fichiers ajoutés

- `app/api/agent/actions/execute/route.ts` — Nouveau moteur d’exécution des actions validées par iNr’Agent : publication Booster et campagnes Propulser/Fidéliser.
- `app/api/agent/actions/prepare-campaign/route.ts` — Préparation des campagnes Propulser/Fidéliser depuis templates + IA + CRM + boîte mail.
- `app/api/agent/actions/prepare-publish/route.ts` — Préparation d’une publication Booster multicanal par iNr’Agent avec contenu IA et banque d’images.
- `app/api/agent/actions/send-stats-report/route.ts` — Génération/envoi du bilan iNrStats PDF au pro.
- `app/api/cron/inr-agent/route.ts` — Cron iNr’Agent : déclenche les automatisations dues et protège les doublons.
- `lib/cronAuth.ts` — Helper de sécurité pour les routes cron avec CRON_SECRET / VERCEL_CRON_SECRET.
- `lib/inrAgentRequest.ts` — Helper de résolution utilisateur pour les actions iNr’Agent manuelles ou internes cron.
- `ops/INR_AGENT_V2_ETAPE10_NOTES.md` — Note technique de l’étape correspondante.
- `ops/INR_AGENT_V2_ETAPE11_AUDIT.md` — Ajout iNr’Agent V2.
- `ops/INR_AGENT_V2_ETAPE1_NOTES.md` — Note technique de l’étape correspondante.
- `ops/INR_AGENT_V2_ETAPE2_NOTES.md` — Note technique de l’étape correspondante.
- `ops/INR_AGENT_V2_ETAPE3_NOTES.md` — Note technique de l’étape correspondante.
- `ops/INR_AGENT_V2_ETAPE4_NOTES.md` — Note technique de l’étape correspondante.
- `ops/INR_AGENT_V2_ETAPE5_NOTES.md` — Note technique de l’étape correspondante.
- `ops/INR_AGENT_V2_ETAPE6_NOTES.md` — Note technique de l’étape correspondante.
- `ops/INR_AGENT_V2_ETAPE7_NOTES.md` — Note technique de l’étape correspondante.
- `ops/INR_AGENT_V2_ETAPE8_NOTES.md` — Note technique de l’étape correspondante.
- `ops/INR_AGENT_V2_ETAPE9_NOTES.md` — Note technique de l’étape correspondante.
- `ops/SUPABASE_INR_AGENT_ETAPE9_INRSEND_ORIGIN.sql` — Migration légère pour marquer les campagnes issues d’iNr’Agent dans iNrSend.
- `ops/SUPABASE_INR_AGENT_V2.sql` — Migration Supabase complète V2 : réglages globaux, réglages par automatisation et actions préparées.

## Fichiers modifiés

- `app/api/agent/actions/route.ts` — API actions iNr’Agent V2 : liste, création, validation/refus et compat payload.
- `app/api/agent/settings/route.ts` — API réglages iNr’Agent V2 : global + 4 automatisations séparées.
- `app/api/booster/publish-now/route.ts` — Ajout facultatif de l’origine iNr’Agent dans app_events.payload sans changer le manuel.
- `app/api/crm/campaigns/route.ts` — Ajout facultatif metadata iNr’Agent dans mail_campaigns avec fallback si SQL étape 9 absent.
- `app/api/inrsend/history/route.ts` — Lecture de l’origine iNr’Agent depuis app_events/mail_campaigns pour afficher la pastille dans iNrSend.
- `app/api/inrstats/inrbadge/route.ts` — Compatibilité appel interne cron/stats report.
- `app/api/inrstats/mails/route.ts` — Compatibilité appel interne cron/stats report.
- `app/api/stats/dashboard-bulk/route.ts` — Compatibilité appel interne cron/stats report + typage propre du meta snapshot.
- `app/dashboard/agent/AgentClient.tsx` — UI iNr’Agent complète : réglages Supabase, aperçu actions, préparation, validation/refus, stats PDF, garde-fous.
- `app/dashboard/agent/agent.module.css` — Styles iNr’Agent V2 : actions préparées, loaders, boutons, garde-fous.
- `app/dashboard/mails/_components/MailboxList.tsx` — Ajout icône iNr’Agent dans la colonne Détails et alignement date.
- `app/dashboard/mails/_lib/mailboxPhase1.tsx` — Typage d’origine iNr’Agent + largeur colonne Détails.
- `app/dashboard/mails/mails.module.css` — Styles icône iNr’Agent et alignement Date/Détails.
- `lib/inrAgentActions.ts` — Types/normalisation des actions iNr’Agent V2.
- `lib/inrAgentSettings.ts` — Types/defaults/sanitation/upsert des réglages iNr’Agent V2.
- `ops/SUPABASE_INR_AGENT_ACTIONS.sql` — Ancien script actions mis à jour pour la compat V2.
- `ops/SUPABASE_INR_AGENT_SETTINGS.sql` — Ancien script settings mis à jour pour la compat V2.
- `vercel.json` — Ajout du cron /api/cron/inr-agent toutes les 15 minutes.

## Fichiers supprimés

- Aucun fichier d’origine supprimé.

## Points de compatibilité manuel

- Booster manuel : pas de changement obligatoire côté utilisateur. L’origine iNr’Agent n’est écrite que si `source = inr_agent` est envoyé.
- Propulser/Fidéliser manuel : la route accepte `metadata`, mais possède un fallback si la colonne n’existe pas encore.
- iNrSend : reste l’historique central. La pastille iNr’Agent s’affiche uniquement si l’origine est détectée.
- Cron : ne prépare que les automatisations iNr’Agent activées et dues, avec anti-doublon.

## Nettoyage effectué

- `tsconfig.tsbuildinfo` était présent dans l’étape 10 alors qu’il n’existait pas dans le zip d’origine. Il a été retiré du zip étape 11.
