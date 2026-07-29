-- iNrCy — Pipeline média universel — Étape 3
-- Transport direct et résumable vers Supabase Storage.
--
-- Cette migration ne supprime aucune table, colonne, policy ou donnée.
-- Elle augmente uniquement le plafond technique des deux buckets utilisés par
-- le pipeline. Les routes iNrCy conservent des garde-fous serveur et ne
-- délivrent des jetons signés qu'aux membres de l'établissement actif.

begin;

-- Plafond infrastructure : 5 Gio. Ce n'est pas une promesse de traitement
-- illimité ; le worker des étapes suivantes garde ses propres protections.
update storage.buckets
set
  file_size_limit = greatest(coalesce(file_size_limit, 0), 5368709120),
  -- Les sources mobiles et professionnelles peuvent avoir des MIME rares ou
  -- absents. Le moteur iNrCy valide le nom, le type détecté et la taille avant
  -- de signer l'upload ; le worker détectera ensuite le format réel.
  allowed_mime_types = null
where id in ('booster', 'inrcy-pro-media');

do $$
declare
  v_missing text[];
begin
  select array_agg(expected.id order by expected.id)
  into v_missing
  from (
    values ('booster'::text), ('inrcy-pro-media'::text)
  ) as expected(id)
  left join storage.buckets bucket on bucket.id = expected.id
  where bucket.id is null;

  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'INRCY_MEDIA_BUCKET_MISSING: %', array_to_string(v_missing, ', ');
  end if;
end;
$$;

comment on table public.pro_media_library is
  'Registre média universel iNrCy. Depuis l''étape 3, les sources peuvent être envoyées directement et de façon résumable vers Storage sans traverser une Function Vercel.';

commit;
