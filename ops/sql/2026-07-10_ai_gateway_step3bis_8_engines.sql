-- AI Gateway Étape 3 bis — 8 moteurs IA préférentiels par compte actif
-- Script idempotent : fonctionne si l'Étape 3 à 4 moteurs a déjà été exécutée
-- ou si la colonne n'existe pas encore.
--
-- À exécuter dans Supabase SQL Editor AVANT de déployer le ZIP Étape 3 bis.

alter table public.business_profiles
  add column if not exists ai_preferred_engine text not null default 'openai';

-- Migration douce des anciennes valeurs / libellés éventuels.
update public.business_profiles
set ai_preferred_engine = case
  when lower(trim(coalesce(ai_preferred_engine, ''))) in ('openai', 'chatgpt', 'gpt', 'open-ai') then 'openai'
  when lower(trim(coalesce(ai_preferred_engine, ''))) in ('anthropic', 'claude', 'anthropic-ai') then 'anthropic'
  when lower(trim(coalesce(ai_preferred_engine, ''))) in ('google', 'gemini', 'google-ai') then 'google'
  when lower(trim(coalesce(ai_preferred_engine, ''))) in ('mistral', 'mistral-ai', 'le-chat', 'le chat') then 'mistral'
  when lower(trim(coalesce(ai_preferred_engine, ''))) in ('xai', 'grok', 'x-ai') then 'xai'
  when lower(trim(coalesce(ai_preferred_engine, ''))) in ('perplexity', 'sonar', 'perplexity-ai') then 'perplexity'
  when lower(trim(coalesce(ai_preferred_engine, ''))) in ('deepseek', 'deep-seek', 'deepseek-ai') then 'deepseek'
  when lower(trim(coalesce(ai_preferred_engine, ''))) in ('meta', 'llama', 'meta-ai', 'meta ai') then 'meta'
  else 'openai'
end;

comment on column public.business_profiles.ai_preferred_engine is
  'Moteur IA préférentiel iNrCy via Vercel AI Gateway : openai, anthropic, google, mistral, xai, perplexity, deepseek, meta.';

-- IMPORTANT : si l'Étape 3 avait déjà créé la contrainte à 4 moteurs,
-- on la remplace explicitement par la version 8 moteurs.
alter table public.business_profiles
  drop constraint if exists business_profiles_ai_preferred_engine_check;

alter table public.business_profiles
  add constraint business_profiles_ai_preferred_engine_check
  check (
    ai_preferred_engine in (
      'openai',
      'anthropic',
      'google',
      'mistral',
      'xai',
      'perplexity',
      'deepseek',
      'meta'
    )
  );
