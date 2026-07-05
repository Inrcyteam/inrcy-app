-- Langue de l'interface iNrCy, indépendante de la langue IA et de la langue clients.
alter table public.business_profiles
  add column if not exists app_language text not null default 'fr';

comment on column public.business_profiles.app_language is 'Langue de l interface iNrCy : fr, en, es, it, de, nl, pt.';

update public.business_profiles
set app_language = 'fr'
where app_language is null or trim(app_language) = '';
