# Site iNrCy - correction du provisioning des nouveaux comptes

## Cause racine

Le fallback applicatif avait bien ete passe a `site_inrcy=false`, mais les parcours de creation de compte ne reappliquaient pas explicitement les valeurs canoniques apres le trigger Supabase.

Si un ancien trigger ou une ancienne fonction SQL creait une ligne `app_bubble_access` avec `site_inrcy=true`, le Dashboard la considerait a juste titre comme une activation admin et rendait le bouton Configurer accessible.

## Correction

1. Les trois parcours applicatifs de creation appellent maintenant `provisionNewAccountBubbleAccess` :
   - inscription publique / essai ;
   - creation d'essai par l'admin ;
   - creation d'un etablissement multicompte.
2. Une migration ajoute un trigger central sur `public.inrcy_accounts` afin de couvrir aussi les creations manuelles ou SQL.
3. Le trigger impose pour chaque nouveau compte :
   - `site_inrcy=false` ;
   - `pinterest=false` ;
   - `tiktok=true` ;
   - `inr_agent=true`.
4. Un script separe permet de remettre a false le compte deja cree par erreur sans toucher aux autres comptes.

## Deploiement

Executer une fois :

`ops/sql/2026-07-26_site_inrcy_opt_in_new_accounts.sql`

Pour le compte deja affecte, renseigner son email puis executer :

`ops/sql/2026-07-26_site_inrcy_repair_one_account.sql`
