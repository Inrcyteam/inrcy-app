-- Configuration IA : langue de génération
-- À exécuter dans Supabase SQL Editor avant de déployer les étapes interface / prompts.
-- Objectif : stocker la langue de sortie demandée pour les contenus générés par l IA.

alter table public.business_profiles
  add column if not exists ai_language text not null default 'fr';

comment on column public.business_profiles.ai_language is 'Langue de génération des contenus IA : fr, en, es, it, de, nl, pt, etc.';

-- Sécurise les anciens profils ou imports éventuels qui auraient une valeur vide.
update public.business_profiles
set ai_language = 'fr'
where ai_language is null or trim(ai_language) = '';
