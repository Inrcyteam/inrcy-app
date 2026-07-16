-- iNrCy - Nettoyage des anciens jobs pg_cron visibles dans Unified Logs
-- Date : 2026-07-16
--
-- Ce script ne touche a aucune donnee metier.
-- Il desactive uniquement deux anciens jobs devenus incompatibles :
--   1. un job qui reference public.stats_snapshots, table absente et inutilisee
--      par la version actuelle de l'application ;
--   2. un job qui supprime directement dans storage.objects pour le bucket
--      inrbox_attachments. Supabase interdit maintenant cette suppression SQL
--      directe et impose la Storage API.
--
-- Le nettoyage de retention iNrSend reste gere cote application par :
--   /api/cron/inrsend-retention

begin;

do $$
declare
  stale_job record;
begin
  if to_regclass('cron.job') is null then
    raise notice 'Aucune table cron.job detectee : rien a desactiver.';
    return;
  end if;

  for stale_job in
    select jobid, jobname, schedule, command
    from cron.job
    where lower(coalesce(command, '')) like '%stats_snapshots%'
       or (
         lower(coalesce(command, '')) like '%storage.objects%'
         and lower(coalesce(command, '')) like '%inrbox_attachments%'
         and lower(coalesce(command, '')) like '%delete%'
       )
  loop
    raise notice 'Desactivation du job pg_cron % (%): %',
      stale_job.jobid,
      coalesce(stale_job.jobname, 'sans nom'),
      stale_job.command;
    perform cron.unschedule(stale_job.jobid);
  end loop;
end
$$;

commit;

-- Verification : cette requete doit retourner 0 ligne apres execution.
select jobid, jobname, schedule, command
from cron.job
where lower(coalesce(command, '')) like '%stats_snapshots%'
   or (
     lower(coalesce(command, '')) like '%storage.objects%'
     and lower(coalesce(command, '')) like '%inrbox_attachments%'
     and lower(coalesce(command, '')) like '%delete%'
   );
