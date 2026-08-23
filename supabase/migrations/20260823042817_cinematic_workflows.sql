-- Durable workflows restored with the cinematic studio surface.
-- The public RPCs are narrowly scoped entry points: both re-check auth.uid(),
-- workspace membership, project ownership, input shapes, and object paths.

create or replace function public.append_project_settings(
  target_workspace_id uuid,
  target_project_id uuid,
  settings_value jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  next_version integer;
  latest_settings jsonb;
  settings_id uuid;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not private.has_workspace_role(
    target_workspace_id,
    array['owner','admin','editor']::public.workspace_role[]
  ) then
    raise exception 'edit permission required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.projects
    where id = target_project_id
      and workspace_id = target_workspace_id
      and archived_at is null
      and deleted_at is null
  ) then
    raise exception 'active project not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(settings_value) <> 'object'
     or octet_length(settings_value::text) > 131072 then
    raise exception 'invalid project settings payload' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_project_id::text, 1));
  select version, settings into next_version, latest_settings
  from public.project_settings
  where project_id = target_project_id
  order by version desc
  limit 1;
  if latest_settings = settings_value then
    return jsonb_build_object('unchanged', true, 'version', next_version);
  end if;
  next_version := coalesce(next_version, 0) + 1;

  insert into public.project_settings (
    workspace_id, project_id, version, settings, created_by
  ) values (
    target_workspace_id, target_project_id, next_version, settings_value, actor
  ) returning id into settings_id;

  insert into public.audit_logs (
    workspace_id, actor_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id, actor, 'project.settings_saved', 'project_settings',
    settings_id, jsonb_build_object('projectId', target_project_id, 'version', next_version)
  );
  return jsonb_build_object('id', settings_id, 'version', next_version, 'unchanged', false);
end;
$$;

revoke all on function public.append_project_settings(uuid, uuid, jsonb) from public, anon;
grant execute on function public.append_project_settings(uuid, uuid, jsonb) to authenticated;

create or replace function public.append_prompt_version(
  target_workspace_id uuid,
  target_project_id uuid,
  raw_prompt_value text,
  compiled_prompt_value text,
  creative_direction_value jsonb,
  technical_settings_value jsonb,
  capability_id_value uuid,
  restored_from_value uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  next_version integer;
  version_id uuid;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not private.has_workspace_role(
    target_workspace_id,
    array['owner','admin','editor']::public.workspace_role[]
  ) then
    raise exception 'edit permission required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.projects
    where id = target_project_id
      and workspace_id = target_workspace_id
      and archived_at is null
      and deleted_at is null
  ) then
    raise exception 'active project not found' using errcode = 'P0002';
  end if;
  if capability_id_value is not null and not exists (
    select 1 from public.model_capabilities
    where id = capability_id_value and enabled
  ) then
    raise exception 'verified capability not found' using errcode = 'P0002';
  end if;
  if restored_from_value is not null and not exists (
    select 1 from public.prompt_versions
    where id = restored_from_value
      and workspace_id = target_workspace_id
      and project_id = target_project_id
  ) then
    raise exception 'prompt version not found' using errcode = 'P0002';
  end if;
  if char_length(raw_prompt_value) > 20000
     or char_length(compiled_prompt_value) > 30000
     or jsonb_typeof(creative_direction_value) <> 'object'
     or jsonb_typeof(technical_settings_value) <> 'object' then
    raise exception 'invalid prompt version payload' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_project_id::text, 0));
  select coalesce(max(version), 0) + 1 into next_version
  from public.prompt_versions where project_id = target_project_id;

  insert into public.prompt_versions (
    workspace_id, project_id, version, raw_prompt, compiled_prompt,
    creative_direction, technical_settings, model_capability_id, created_by,
    restored_from_id
  ) values (
    target_workspace_id, target_project_id, next_version, raw_prompt_value,
    compiled_prompt_value, creative_direction_value, technical_settings_value,
    capability_id_value, actor, restored_from_value
  ) returning id into version_id;

  insert into public.audit_logs (
    workspace_id, actor_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id, actor,
    case when restored_from_value is null then 'prompt.version_saved' else 'prompt.version_restored' end,
    'prompt_version', version_id,
    jsonb_build_object('projectId', target_project_id, 'version', next_version)
  );

  return jsonb_build_object('id', version_id, 'version', next_version);
end;
$$;

revoke all on function public.append_prompt_version(uuid, uuid, text, text, jsonb, jsonb, uuid, uuid) from public, anon;
grant execute on function public.append_prompt_version(uuid, uuid, text, text, jsonb, jsonb, uuid, uuid) to authenticated;

create or replace function public.record_derived_image_asset(
  target_workspace_id uuid,
  target_project_id uuid,
  source_asset_ids_value uuid[],
  original_filename_value text,
  safe_filename_value text,
  mime_type_value text,
  byte_size_value bigint,
  storage_path_value text,
  sha256_value text,
  edit_recipe_value jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  asset_uuid uuid := gen_random_uuid();
  source_count integer;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not private.has_workspace_role(
    target_workspace_id,
    array['owner','admin','editor']::public.workspace_role[]
  ) then
    raise exception 'edit permission required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.projects
    where id = target_project_id
      and workspace_id = target_workspace_id
      and archived_at is null
      and deleted_at is null
  ) then
    raise exception 'active project not found' using errcode = 'P0002';
  end if;
  source_count := coalesce(array_length(source_asset_ids_value, 1), 0);
  if source_count < 1 or source_count > 5
     or source_count <> (
       select count(distinct asset.id) from public.project_assets link
       join public.assets asset on asset.id = link.asset_id
       where link.workspace_id = target_workspace_id
         and link.project_id = target_project_id
         and asset.id = any(source_asset_ids_value)
         and asset.media_kind = 'image'
         and asset.lifecycle_state = 'ready'
         and asset.archived_at is null
     ) then
    raise exception 'one to five ready project images are required' using errcode = '22023';
  end if;
  if mime_type_value not in ('image/png', 'image/jpeg', 'image/webp')
     or byte_size_value < 1 or byte_size_value > 104857600
     or sha256_value !~ '^[a-f0-9]{64}$'
     or storage_path_value not like target_workspace_id::text || '/' || target_project_id::text || '/edits/%'
     or char_length(original_filename_value) not between 1 and 255
     or char_length(safe_filename_value) not between 1 and 255
     or jsonb_typeof(edit_recipe_value) <> 'object' then
    raise exception 'invalid derived asset metadata' using errcode = '22023';
  end if;

  insert into public.assets (
    id, workspace_id, media_kind, storage_bucket, storage_path,
    original_filename, safe_filename, mime_type, byte_size, sha256, metadata,
    lifecycle_state, created_by
  ) values (
    asset_uuid, target_workspace_id, 'image', 'vesperframe-generated',
    storage_path_value, original_filename_value, safe_filename_value,
    mime_type_value, byte_size_value, sha256_value,
    jsonb_build_object(
      'derivedKind', 'layer-composite',
      'sourceAssetIds', to_jsonb(source_asset_ids_value),
      'editRecipe', edit_recipe_value
    ),
    'ready', actor
  );

  insert into public.project_assets (
    workspace_id, project_id, asset_id, role, role_label, created_by
  ) values (
    target_workspace_id, target_project_id, asset_uuid, 'generated_output',
    'Layer composite', actor
  );

  insert into public.audit_logs (
    workspace_id, actor_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id, actor, 'asset.layer_composite_created', 'asset',
    asset_uuid,
    jsonb_build_object('projectId', target_project_id, 'sourceCount', source_count)
  );

  return jsonb_build_object('assetId', asset_uuid);
end;
$$;

revoke all on function public.record_derived_image_asset(uuid, uuid, uuid[], text, text, text, bigint, text, text, jsonb) from public, anon;
grant execute on function public.record_derived_image_asset(uuid, uuid, uuid[], text, text, text, bigint, text, text, jsonb) to authenticated;
