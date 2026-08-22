create function public.create_external_reference_asset(
  target_workspace_id uuid,
  target_project_id uuid,
  reference_label text,
  external_id_value text,
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
  storage_path_value text;
  content_hash text;
begin
  if actor is null or not (select private.has_workspace_role(target_workspace_id, array['owner','admin','editor']::public.workspace_role[])) then
    raise exception 'reference permission denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects where id = target_project_id and workspace_id = target_workspace_id and archived_at is null and deleted_at is null) then
    raise exception 'project is unavailable' using errcode = '42501';
  end if;
  if char_length(reference_label) not between 1 and 120 or external_id_value !~ '^[A-Za-z0-9._:-]{3,200}$' then
    raise exception 'external reference is invalid' using errcode = '22023';
  end if;
  if requested_role not in ('character', 'reference_audio') then
    raise exception 'external reference role is unsupported' using errcode = '22023';
  end if;
  content_hash := encode(extensions.digest(convert_to(external_id_value, 'UTF8'), 'sha256'), 'hex');
  storage_path_value := target_workspace_id::text || '/' || target_project_id::text || '/external/' || asset_uuid::text;
  insert into public.assets (
    id, workspace_id, media_kind, storage_bucket, storage_path, original_filename,
    safe_filename, mime_type, byte_size, sha256, metadata, lifecycle_state, created_by
  ) values (
    asset_uuid, target_workspace_id, 'other', 'vesperframe-sources', storage_path_value,
    left(reference_label || '.ref', 255), left('external-' || asset_uuid::text || '.ref', 255),
    'application/x.external-id', 0, content_hash,
    jsonb_build_object('externalId', external_id_value, 'externalKind', requested_role, 'label', reference_label),
    'ready', actor
  );
  insert into public.project_assets (workspace_id, project_id, asset_id, role, role_label, created_by)
    values (target_workspace_id, target_project_id, asset_uuid, requested_role, reference_label, actor);
  insert into public.audit_logs (workspace_id, actor_id, action, target_type, target_id, metadata)
    values (target_workspace_id, actor, 'asset.external_reference_created', 'asset', asset_uuid,
      jsonb_build_object('role', requested_role));
  return jsonb_build_object('assetId', asset_uuid, 'role', requested_role, 'label', reference_label);
end;
$$;

revoke all on function public.create_external_reference_asset(uuid, uuid, text, text, public.asset_role) from public, anon;
grant execute on function public.create_external_reference_asset(uuid, uuid, text, text, public.asset_role) to authenticated;

comment on function public.create_external_reference_asset(uuid, uuid, text, text, public.asset_role)
  is 'Creates a tenant-scoped provider identity reference without storing secrets or pretending an external ID is an uploaded file.';
