alter table public.mail_campaigns
  add column if not exists folder text,
  add column if not exists track_kind text,
  add column if not exists track_type text,
  add column if not exists template_key text;

update public.mail_campaigns
set folder = case
  when folder is not null and folder <> '' then folder
  when type = 'facture' then 'factures'
  when type = 'devis' then 'devis'
  else 'mails'
end
where folder is null or folder = '';

create index if not exists mail_campaigns_user_folder_created_idx
  on public.mail_campaigns (user_id, folder, created_at desc);
