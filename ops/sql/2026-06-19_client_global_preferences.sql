-- Préférences générales : échanges clients et localisation
-- À exécuter dans Supabase SQL Editor avant de déployer l'interface des préférences générales.
-- Objectif : centraliser les paramètres globaux utilisés par l'iNrBadge, iNrCalendar, les mails clients, puis devis/factures.

alter table public.business_profiles
  add column if not exists client_language text not null default 'fr',
  add column if not exists timezone text not null default 'Europe/Paris',
  add column if not exists date_format text not null default 'dd/MM/yyyy',
  add column if not exists currency text not null default 'EUR';

comment on column public.business_profiles.client_language is 'Langue des échanges clients : iNrBadge, rendez-vous, emails clients, devis/factures. Valeurs prévues : fr, en, es, it, de, nl, pt.';
comment on column public.business_profiles.timezone is 'Fuseau horaire principal du professionnel, ex: Europe/Paris.';
comment on column public.business_profiles.date_format is 'Format de date préféré pour les échanges clients, ex: dd/MM/yyyy.';
comment on column public.business_profiles.currency is 'Devise principale du professionnel, ex: EUR, USD, GBP, CHF.';

-- Sécurise les anciens profils ou imports éventuels qui auraient une valeur vide.
update public.business_profiles
set client_language = 'fr'
where client_language is null or trim(client_language) = '';

update public.business_profiles
set timezone = 'Europe/Paris'
where timezone is null or trim(timezone) = '';

update public.business_profiles
set date_format = 'dd/MM/yyyy'
where date_format is null or trim(date_format) = '';

update public.business_profiles
set currency = 'EUR'
where currency is null or trim(currency) = '';
