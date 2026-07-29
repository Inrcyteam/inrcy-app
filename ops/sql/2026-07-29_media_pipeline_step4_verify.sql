-- iNrCy — Pipeline média universel — Étape 4 — Vérification lecture seule
-- Aucune migration supplémentaire n'est requise : l'étape 4 réutilise le
-- registre et les workspaces créés à l'étape 2.

do $$
begin
  if to_regclass('public.pro_media_library') is null then
    raise exception 'Étape 4 impossible : public.pro_media_library est absente.';
  end if;
  if to_regclass('public.publication_workspaces') is null then
    raise exception 'Étape 4 impossible : public.publication_workspaces est absente.';
  end if;
  if to_regclass('public.publication_workspace_media') is null then
    raise exception 'Étape 4 impossible : public.publication_workspace_media est absente.';
  end if;
  if to_regprocedure('public.inrcy_validate_publication_workspace_media()') is null then
    raise exception 'Étape 4 impossible : le trigger de contrat média est absent.';
  end if;
end;
$$;

select
  'media_pipeline_step4_ready' as check_name,
  true as ok,
  (select count(*) from public.publication_workspaces) as workspace_count,
  (select count(*) from public.publication_workspace_media) as workspace_media_count;
