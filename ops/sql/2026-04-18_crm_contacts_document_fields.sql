alter table if exists public.crm_contacts
  add column if not exists vat_number text,
  add column if not exists billing_address text,
  add column if not exists delivery_address text;

create index if not exists crm_contacts_user_vat_number_idx
on public.crm_contacts (user_id, vat_number);
