-- Booster Publisher: finalise the durable mixed-media workspace contract.
-- Run only after every deployed application client writes videos at position 5.
-- Images remain at positions 0..4; the single video is strictly position 5.

begin;

lock table public.publication_workspace_media in share row exclusive mode;

-- Fail closed before touching data if the transitional state contains an
-- unexpected collision or a contract violation that cannot be repaired safely.
do $$
begin
  if exists (
    select 1
    from public.publication_workspace_media wm
    join public.pro_media_library media on media.id = wm.media_id
    where (media.media_type = 'image' and wm.position not between 0 and 4)
       or (media.media_type = 'video' and wm.position not in (0, 5))
       or media.media_type not in ('image', 'video')
  ) then
    raise exception 'INRCY_MEDIA_FINALIZATION_INVALID_POSITION' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.publication_workspace_media wm
    join public.pro_media_library media on media.id = wm.media_id
    group by wm.workspace_id
    having count(*) filter (where media.media_type = 'image') > 5
        or count(*) filter (where media.media_type = 'video') > 1
  ) then
    raise exception 'INRCY_MEDIA_FINALIZATION_WORKSPACE_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.publication_workspace_media video_link
    join public.pro_media_library video_media
      on video_media.id = video_link.media_id
     and video_media.media_type = 'video'
    join public.publication_workspace_media occupied
      on occupied.workspace_id = video_link.workspace_id
     and occupied.position = 5
     and occupied.media_id <> video_link.media_id
    where video_link.position = 0
  ) then
    raise exception 'INRCY_MEDIA_FINALIZATION_POSITION_FIVE_OCCUPIED' using errcode = 'P0001';
  end if;
end;
$$;

-- Archived associations may legitimately reference an inactive media row. Move
-- only the transitional video positions under the table lock, bypassing the
-- row validator for this deterministic maintenance update.
alter table public.publication_workspace_media
  disable trigger publication_workspace_media_validate;

update public.publication_workspace_media wm
set position = 5,
    updated_at = now()
from public.pro_media_library media
where media.id = wm.media_id
  and media.media_type = 'video'
  and wm.position = 0;

alter table public.publication_workspace_media
  enable trigger publication_workspace_media_validate;

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
    if new.position <> 5 then
      raise exception 'INRCY_MEDIA_VIDEO_POSITION_MUST_BE_FIVE' using errcode = 'P0001';
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

revoke all on function public.inrcy_validate_publication_workspace_media()
  from public, anon, authenticated;
grant execute on function public.inrcy_validate_publication_workspace_media()
  to authenticated, service_role;

comment on table public.publication_workspace_media is
  'Workspace Booster: maximum 5 images (positions 0..4) and 1 video (strictly position 5), selected independently per channel.';

-- The migration must leave no transitional video row behind.
do $$
begin
  if exists (
    select 1
    from public.publication_workspace_media wm
    join public.pro_media_library media on media.id = wm.media_id
    where (media.media_type = 'image' and wm.position not between 0 and 4)
       or (media.media_type = 'video' and wm.position <> 5)
  ) then
    raise exception 'INRCY_MEDIA_FINALIZATION_INCOMPLETE' using errcode = 'P0001';
  end if;
end;
$$;

commit;
