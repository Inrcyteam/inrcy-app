-- Renforce l'idempotence des recompenses de fidelite.
-- Le code applicatif utilise ON CONFLICT sur ces trois colonnes afin que deux
-- appels concurrents restent idempotents sans produire de 23505/409.
-- Si des doublons historiques existent, les traiter avant d'appliquer ce script
-- plutot que de supprimer automatiquement des mouvements de solde.

do $$
begin
  if exists (
    select 1
    from public.loyalty_ledger
    group by user_id, action_key, source_id
    having count(*) > 1
  ) then
    raise exception
      'Doublons loyalty_ledger detectes pour (user_id, action_key, source_id) : nettoyage manuel requis avant creation de l index.';
  end if;

  create unique index if not exists loyalty_ledger_user_action_source_uidx
    on public.loyalty_ledger (user_id, action_key, source_id);
end;
$$;
