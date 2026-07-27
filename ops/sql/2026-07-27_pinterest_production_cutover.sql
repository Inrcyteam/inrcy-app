-- iNrCy - Pinterest Standard : bascule definitive vers la Production.
-- Idempotent. Ne touche qu'aux anciennes connexions explicitement marquees sandbox.
-- Les comptes concernes devront reconnecter Pinterest depuis Canaux afin d'obtenir
-- un jeton Standard de Production. Les connexions deja Production restent intactes.

begin;

update public.integrations
set
  status = 'disconnected',
  access_token_enc = null,
  refresh_token_enc = null,
  expires_at = null,
  meta = jsonb_set(
    coalesce(meta, '{}'::jsonb) - 'pinterest_api_environment',
    '{pinterest_reconnect_required}',
    'true'::jsonb,
    true
  ),
  updated_at = now()
where provider = 'pinterest'
  and source = 'pinterest'
  and product = 'pinterest'
  and lower(coalesce(meta ->> 'pinterest_api_environment', '')) = 'sandbox';

commit;

-- Controle : doit retourner 0 apres la bascule.
-- select count(*) as anciennes_connexions_sandbox
-- from public.integrations
-- where provider = 'pinterest'
--   and source = 'pinterest'
--   and product = 'pinterest'
--   and lower(coalesce(meta ->> 'pinterest_api_environment', '')) = 'sandbox';
