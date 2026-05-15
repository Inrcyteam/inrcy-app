-- Configuration IA + typologie de clientèle pour Booster / Publier
-- À exécuter dans Supabase SQL Editor avant de déployer le zip si les colonnes n'existent pas encore.

alter table public.business_profiles
  add column if not exists business_description text not null default '',
  add column if not exists customer_typologies text[] not null default '{}',
  add column if not exists communication_style text not null default 'local_humain',
  add column if not exists emoji_level text not null default 'light',
  add column if not exists ai_length text not null default 'medium',
  add column if not exists address_mode text not null default 'vous',
  add column if not exists ai_voice text not null default 'auto',
  add column if not exists ai_creativity text not null default 'balanced',
  add column if not exists ai_custom_instructions text not null default '';

comment on column public.business_profiles.customer_typologies is 'Typologies de clientèle ciblées : particuliers, professionnels, collectivites.';
comment on column public.business_profiles.communication_style is 'Préférence de style IA global.';
comment on column public.business_profiles.emoji_level is 'Niveau d emojis souhaité pour les contenus IA.';
comment on column public.business_profiles.ai_length is 'Longueur favorite des contenus IA.';
comment on column public.business_profiles.address_mode is 'Tutoiement, vouvoiement ou automatique.';
comment on column public.business_profiles.ai_voice is 'Voix de l entreprise utilisée par l IA : auto, je, nous ou neutral.';
comment on column public.business_profiles.ai_creativity is 'Niveau de créativité IA utilisé par Booster.';

comment on column public.business_profiles.business_description is 'Présentation courte de l’activité utilisée pour personnaliser les contenus IA.';

comment on column public.business_profiles.ai_custom_instructions is 'Consignes personnalisées à respecter ou à éviter dans les contenus générés par l IA.';
