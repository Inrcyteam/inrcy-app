-- iNrCy - Pinterest Standard - nettoyage des copies API historiques
-- À exécuter une fois dans Supabase SQL Editor avant la démo Standard.
-- Conserve les jetons OAuth chiffrés et les préférences propres à iNrCy.

begin;

update public.integrations
set
  display_name = 'Compte Pinterest',
  provider_account_id = null,
  resource_id = null,
  resource_label = null,
  meta = (
    coalesce(meta, '{}'::jsonb)
      - 'account_id'
      - 'username'
      - 'display_name'
      - 'profile_url'
      - 'avatar_url'
      - 'website_url'
      - 'account_type'
      - 'boards'
      - 'default_board_id'
      - 'default_board_name'
      - 'refresh_expires_at'
  ),
  updated_at = now()
where provider = 'pinterest'
  and source = 'pinterest'
  and product = 'pinterest';

update public.pro_tools_configs
set settings = jsonb_set(
  coalesce(settings, '{}'::jsonb),
  '{pinterest}',
  (
    coalesce(settings -> 'pinterest', '{}'::jsonb)
      - 'boards'
      - 'avatarUrl'
      - 'websiteUrl'
      - 'accountType'
      - 'accountName'
      - 'displayName'
      - 'username'
      - 'profileUrl'
      - 'url'
      - 'defaultBoardId'
      - 'defaultBoardName'
      - 'boardId'
      - 'boardName'
      - 'scopes'
      - 'expiresAt'
      - 'connected'
      - 'accountConnected'
      - 'mode'
  ),
  true
)
where coalesce(settings, '{}'::jsonb) ? 'pinterest';

commit;
