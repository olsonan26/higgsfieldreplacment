create function public.reserve_source_asset(
  target_workspace_id uuid,
  target_project_id uuid,
  original_filename_value text,
  safe_filename_value text,
  mime_type_value text,
  byte_size_value bigint,
  requested_role public.asset_role
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  asset_uuid uuid := gen_random_uuid();
  media_kind_value public.media_kind;
  storage_path_value text;
begin
  if actor is null or not (select private.has_workspace_role(target_workspace_id, array['owner','admin','editor']::public.workspace_role[])) then
    raise exception 'asset permission denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects where id = target_project_id and workspace_id = target_workspace_id and archived_at is null and deleted_at is null) then
    raise exception 'project is unavailable' using errcode = '42501';
  end if;
  if char_length(original_filename_value) not between 1 and 255
    or char_length(safe_filename_value) not between 1 and 255
    or safe_filename_value !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' then
    raise exception 'asset filename is invalid' using errcode = '22023';
  end if;
  if byte_size_value not between 1 and 104857600 then
    raise exception 'asset size is outside the source limit' using errcode = '22023';
  end if;
  media_kind_value := case
    when mime_type_value in ('image/jpeg','image/png','image/webp') then 'image'::public.media_kind
    when mime_type_value in ('video/mp4','video/quicktime','video/webm') then 'video'::public.media_kind
    when mime_type_value in ('audio/mpeg','audio/wav','audio/x-wav','audio/mp4') then 'audio'::public.media_kind
    else null
  end;
  if media_kind_value is null then raise exception 'asset MIME type is unsupported' using errcode = '22023'; end if;
  if requested_role not in ('source','reference_image','reference_video','reference_audio','first_frame','last_frame','character','element') then
    raise exception 'asset role is unsupported' using errcode = '22023';
  end if;
  storage_path_value := target_workspace_id::text || '/' || target_project_id::text || '/' || asset_uuid::text || '/' || safe_filename_value;
  insert into public.assets (
    id, workspace_id, media_kind, storage_bucket, storage_path, original_filename,
    safe_filename, mime_type, byte_size, lifecycle_state, created_by
  ) values (
    asset_uuid, target_workspace_id, media_kind_value, 'vesperframe-sources', storage_path_value,
    original_filename_value, safe_filename_value, mime_type_value, byte_size_value, 'uploading', actor
  );
  insert into public.project_assets (workspace_id, project_id, asset_id, role, created_by)
    values (target_workspace_id, target_project_id, asset_uuid, requested_role, actor);
  insert into public.audit_logs (workspace_id, actor_id, action, target_type, target_id, metadata)
    values (target_workspace_id, actor, 'asset.upload_reserved', 'asset', asset_uuid,
      jsonb_build_object('mediaKind', media_kind_value, 'byteSize', byte_size_value, 'role', requested_role));
  return jsonb_build_object('assetId', asset_uuid, 'storageBucket', 'vesperframe-sources', 'storagePath', storage_path_value);
end;
$$;
revoke all on function public.reserve_source_asset(uuid, uuid, text, text, text, bigint, public.asset_role) from public, anon;
grant execute on function public.reserve_source_asset(uuid, uuid, text, text, text, bigint, public.asset_role) to authenticated;

create function private.audit_project_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare action_name text;
begin
  action_name := case
    when new.deleted_at is distinct from old.deleted_at then case when new.deleted_at is null then 'project.restored_from_trash' else 'project.moved_to_trash' end
    when new.archived_at is distinct from old.archived_at then case when new.archived_at is null then 'project.restored' else 'project.archived' end
    else 'project.updated'
  end;
  insert into public.audit_logs (workspace_id, actor_id, action, target_type, target_id, metadata)
    values (old.workspace_id, (select auth.uid()), action_name, 'project', old.id,
      jsonb_build_object('nameChanged', new.name is distinct from old.name, 'descriptionChanged', new.description is distinct from old.description));
  return new;
end;
$$;
create trigger projects_audit_change after update on public.projects
  for each row execute function private.audit_project_change();

create function private.audit_generation_skill_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name is distinct from old.name or new.description is distinct from old.description or new.media_scope is distinct from old.media_scope then
    insert into public.audit_logs (workspace_id, actor_id, action, target_type, target_id, metadata)
      values (old.workspace_id, (select auth.uid()), 'generation_skill.updated', 'generation_skill', old.id,
        jsonb_build_object('nameChanged', new.name is distinct from old.name, 'scopeChanged', new.media_scope is distinct from old.media_scope));
  end if;
  return new;
end;
$$;
create trigger generation_skills_audit_change after update on public.generation_skills
  for each row execute function private.audit_generation_skill_change();

revoke insert, update, delete on public.assets from authenticated;
grant update (archived_at) on public.assets to authenticated;

drop policy storage_editor_insert on storage.objects;
drop policy storage_editor_update on storage.objects;
create policy storage_editor_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vesperframe-sources'
    and exists (
      select 1 from public.assets asset
      where asset.storage_bucket = bucket_id and asset.storage_path = name
        and asset.lifecycle_state = 'uploading' and asset.created_by = (select auth.uid())
        and (select private.has_workspace_role(asset.workspace_id, array['owner','admin','editor']::public.workspace_role[]))
    )
  );
create policy storage_editor_update on storage.objects for update to authenticated
  using (
    bucket_id = 'vesperframe-sources'
    and exists (
      select 1 from public.assets asset
      where asset.storage_bucket = bucket_id and asset.storage_path = name
        and asset.lifecycle_state = 'uploading' and asset.created_by = (select auth.uid())
        and (select private.has_workspace_role(asset.workspace_id, array['owner','admin','editor']::public.workspace_role[]))
    )
  )
  with check (
    bucket_id = 'vesperframe-sources'
    and exists (
      select 1 from public.assets asset
      where asset.storage_bucket = bucket_id and asset.storage_path = name
        and asset.lifecycle_state = 'uploading' and asset.created_by = (select auth.uid())
        and (select private.has_workspace_role(asset.workspace_id, array['owner','admin','editor']::public.workspace_role[]))
    )
  );

update storage.buckets set allowed_mime_types = array[
  'image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm',
  'audio/mpeg','audio/wav','audio/x-wav','audio/mp4'
] where id = 'vesperframe-sources';

comment on function public.reserve_source_asset(uuid, uuid, text, text, text, bigint, public.asset_role)
  is 'Atomically reserves a validated private source path and project link before issuing a signed upload.';
