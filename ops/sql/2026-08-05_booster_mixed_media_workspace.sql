-- Booster Publisher: one durable workspace may carry 5 images AND 1 video.
-- Images keep positions 0..4; the single video uses position 5.
-- Safe to run after 2026-07-29_media_pipeline_step2_universal_registry.sql.

begin;

-- Keep the schema and the trigger transition atomic. The lock is held only for
-- this short migration and prevents a concurrent upload from observing the
-- temporary state without the position constraint.
lock table public.publication_workspace_media in share row exclusive mode;

alter table public.publication_workspace_media
  drop constraint if exists publication_workspace_media_position_check;

-- Replace the legacy "images OR video" validator before moving historical
-- video rows. The trigger is already attached to this function in step 2.
create or replace function public.inrcy_validate_publication_workspace_media()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_account_id uuid;
  v_media_account_id uuid;
  v_media_type text;
  v_media_active boolean;
  v_upload_status text;
  v_existing_image_count integer := 0;
  v_has_video boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text, 0));

  select w.account_id
  into v_workspace_account_id
  from public.publication_workspaces w
  where w.id = new.workspace_id;

  if v_workspace_account_id is null then
    raise exception 'INRCY_MEDIA_WORKSPACE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select media.user_id, media.media_type, media.is_active, media.upload_status
  into v_media_account_id, v_media_type, v_media_active, v_upload_status
  from public.pro_media_library media
  where media.id = new.media_id;

  if v_media_account_id is null then
    raise exception 'INRCY_MEDIA_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_workspace_account_id <> v_media_account_id then
    raise exception 'INRCY_MEDIA_CROSS_ACCOUNT_LINK_DENIED' using errcode = 'P0001';
  end if;
  if not coalesce(v_media_active, false) or v_upload_status = 'removed' then
    raise exception 'INRCY_MEDIA_INACTIVE' using errcode = 'P0001';
  end if;

  -- OLD is not defined for INSERT, so keep both paths explicit. On UPDATE the
  -- current association is excluded from the counts before validating NEW.
  if tg_op = 'UPDATE' then
    select
      count(*) filter (where media.media_type = 'image')::integer,
      coalesce(bool_or(media.media_type = 'video'), false)
    into v_existing_image_count, v_has_video
    from public.publication_workspace_media wm
    join public.pro_media_library media on media.id = wm.media_id
    where wm.workspace_id = new.workspace_id
      and not (
        wm.workspace_id = old.workspace_id
        and wm.media_id = old.media_id
      );
  else
    select
      count(*) filter (where media.media_type = 'image')::integer,
      coalesce(bool_or(media.media_type = 'video'), false)
    into v_existing_image_count, v_has_video
    from public.publication_workspace_media wm
    join public.pro_media_library media on media.id = wm.media_id
    where wm.workspace_id = new.workspace_id;
  end if;

  if v_media_type = 'video' then
    -- Position 0 remains temporarily accepted for the already-deployed
    -- video-only client during the rolling application deployment. It cannot
    -- coexist with images and every new mixed-capable client writes position 5.
    if new.position not in (0, 5) then
      raise exception 'INRCY_MEDIA_VIDEO_POSITION_MUST_BE_ZERO_OR_FIVE' using errcode = 'P0001';
    end if;
    if new.position = 0 and v_existing_image_count > 0 then
      raise exception 'INRCY_MEDIA_CONTRACT_FIVE_IMAGES_AND_ONE_VIDEO' using errcode = 'P0001';
    end if;
    if v_has_video then
      raise exception 'INRCY_MEDIA_CONTRACT_FIVE_IMAGES_AND_ONE_VIDEO' using errcode = 'P0001';
    end if;
  elsif v_media_type = 'image' then
    if new.position < 0 or new.position > 4 or v_existing_image_count >= 5 then
      raise exception 'INRCY_MEDIA_CONTRACT_FIVE_IMAGES_AND_ONE_VIDEO' using errcode = 'P0001';
    end if;
  else
    raise exception 'INRCY_MEDIA_TYPE_UNSUPPORTED' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- The previous trigger guaranteed that a video-only workspace had no image,
-- therefore moving historical videos from position 0 to 5 cannot collide.
-- Some archived associations legitimately point to an inactive media row. The
-- final validator must keep rejecting such rows, so bypass it only for this
-- locked, deterministic position migration and re-enable it immediately.
alter table public.publication_workspace_media
  disable trigger publication_workspace_media_validate;

update public.publication_workspace_media wm
set position = 5,
    updated_at = now()
from public.pro_media_library media
where media.id = wm.media_id
  and media.media_type = 'video'
  and wm.position <> 5;

alter table public.publication_workspace_media
  enable trigger publication_workspace_media_validate;

alter table public.publication_workspace_media
  add constraint publication_workspace_media_position_check
  check (position between 0 and 5) not valid;

alter table public.publication_workspace_media
  validate constraint publication_workspace_media_position_check;

revoke all on function public.inrcy_validate_publication_workspace_media()
  from public, anon, authenticated;
grant execute on function public.inrcy_validate_publication_workspace_media()
  to authenticated, service_role;

comment on table public.publication_workspace_media is
  'Workspace Booster: maximum 5 images (positions 0..4) and 1 video (position 5), selected independently per channel.';

commit;

-- Verification (must return 0 invalid rows):
select count(*) as invalid_workspace_media_rows
from public.publication_workspace_media wm
join public.pro_media_library media on media.id = wm.media_id
where (media.media_type = 'image' and wm.position not between 0 and 4)
   or (media.media_type = 'video' and wm.position <> 5);
