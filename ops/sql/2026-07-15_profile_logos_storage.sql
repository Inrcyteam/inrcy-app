-- Logo entreprise : bucket privé, formats image maîtrisés et scope établissement.
-- À exécuter dans Supabase SQL Editor avant de déployer la nouvelle interface Profil.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'logos',
  'logos',
  false,
  20971520,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "logos_select_own" on storage.objects;
create policy "logos_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'logos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.inrcy_can_access_account_text((storage.foldername(name))[1])
    )
  );

drop policy if exists "logos_insert_own" on storage.objects;
create policy "logos_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'logos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.inrcy_can_access_account_text((storage.foldername(name))[1])
    )
  );

drop policy if exists "logos_update_own" on storage.objects;
create policy "logos_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'logos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.inrcy_can_access_account_text((storage.foldername(name))[1])
    )
  )
  with check (
    bucket_id = 'logos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.inrcy_can_access_account_text((storage.foldername(name))[1])
    )
  );

drop policy if exists "logos_delete_own" on storage.objects;
create policy "logos_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'logos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.inrcy_can_access_account_text((storage.foldername(name))[1])
    )
  );
