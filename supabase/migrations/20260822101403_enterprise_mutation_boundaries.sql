-- Keep multi-row lifecycle operations atomic and narrow mutable columns exposed
-- to authenticated PostgREST clients.

create function private.initialize_project_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_settings (workspace_id, project_id, version, settings, created_by)
    values (new.workspace_id, new.id, 1, '{"mediaKind":"video"}'::jsonb, new.created_by)
    on conflict (project_id, version) do nothing;
  insert into public.prompt_versions (workspace_id, project_id, version, created_by)
    values (new.workspace_id, new.id, 1, new.created_by)
    on conflict (project_id, version) do nothing;
  insert into public.audit_logs (workspace_id, actor_id, action, target_type, target_id, metadata)
    values (new.workspace_id, new.created_by, 'project.created', 'project', new.id, jsonb_build_object('name', new.name));
  return new;
end;
$$;

create or replace function private.bootstrap_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_uuid uuid := gen_random_uuid();
  project_uuid uuid := gen_random_uuid();
  proposed_name text;
  proposed_slug text;
begin
  proposed_name := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'creator'), '@', 1), 'VesperFrame creator'), 120);
  proposed_slug := 'workspace-' || left(replace(new.id::text, '-', ''), 16);
  insert into public.profiles (id, display_name) values (new.id, proposed_name);
  insert into public.workspaces (id, name, slug, owner_id)
    values (workspace_uuid, proposed_name || '''s workspace', proposed_slug, new.id);
  insert into public.workspace_memberships (workspace_id, user_id, role, monthly_credit_limit, daily_generation_limit)
    values (workspace_uuid, new.id, 'owner', 25, 10);
  insert into public.projects (id, workspace_id, name, created_by)
    values (project_uuid, workspace_uuid, 'First project', new.id);
  insert into public.audit_logs (workspace_id, actor_id, action, target_type, target_id, metadata)
    values (workspace_uuid, new.id, 'workspace.created', 'workspace', workspace_uuid, '{"source":"auth-bootstrap"}'::jsonb);
  return new;
end;
$$;

create trigger projects_initialize_records
  after insert on public.projects
  for each row execute function private.initialize_project_records();

create function private.guard_project_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id
    or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'project ownership fields are immutable' using errcode = '55000';
  end if;
  if new.deleted_at is distinct from old.deleted_at and (select auth.uid()) is not null
    and not (select private.has_workspace_role(old.workspace_id, array['owner']::public.workspace_role[])) then
    raise exception 'only an owner may change permanent-deletion state' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger projects_guard_mutation
  before update on public.projects
  for each row execute function private.guard_project_mutation();

create function public.create_generation_skill(
  target_workspace_id uuid,
  skill_name text,
  skill_slug text,
  skill_description text,
  skill_media_scope public.generation_skill_scope,
  original_filename_value text,
  markdown_content_value text,
  content_sha256_value text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  skill_uuid uuid := gen_random_uuid();
  version_uuid uuid := gen_random_uuid();
  computed_hash text;
begin
  if actor is null or not (select private.has_workspace_role(target_workspace_id, array['owner','admin','editor']::public.workspace_role[])) then
    raise exception 'generation skill permission denied' using errcode = '42501';
  end if;
  if char_length(markdown_content_value) not between 1 and 40000 or octet_length(markdown_content_value) > 65536 then
    raise exception 'generation skill content is outside the supported limit' using errcode = '22023';
  end if;
  computed_hash := encode(extensions.digest(convert_to(markdown_content_value, 'UTF8'), 'sha256'), 'hex');
  if content_sha256_value <> computed_hash then
    raise exception 'generation skill content hash mismatch' using errcode = '22023';
  end if;
  insert into public.generation_skills (
    id, workspace_id, name, slug, description, media_scope, created_by
  ) values (
    skill_uuid, target_workspace_id, trim(skill_name), skill_slug, coalesce(skill_description, ''), skill_media_scope, actor
  );
  insert into public.generation_skill_versions (
    id, skill_id, workspace_id, version, original_filename, markdown_content, content_sha256, created_by
  ) values (
    version_uuid, skill_uuid, target_workspace_id, 1, original_filename_value,
    markdown_content_value, computed_hash, actor
  );
  update public.generation_skills set active_version_id = version_uuid where id = skill_uuid;
  insert into public.audit_logs (workspace_id, actor_id, action, target_type, target_id, metadata)
    values (target_workspace_id, actor, 'generation_skill.created', 'generation_skill', skill_uuid,
      jsonb_build_object('version', 1, 'contentSha256', computed_hash, 'mediaScope', skill_media_scope));
  return jsonb_build_object('skillId', skill_uuid, 'versionId', version_uuid, 'version', 1, 'contentSha256', computed_hash);
end;
$$;

create function public.add_generation_skill_version(
  target_workspace_id uuid,
  target_skill_id uuid,
  original_filename_value text,
  markdown_content_value text,
  content_sha256_value text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  next_version integer;
  version_uuid uuid := gen_random_uuid();
  computed_hash text;
begin
  if actor is null or not (select private.has_workspace_role(target_workspace_id, array['owner','admin','editor']::public.workspace_role[])) then
    raise exception 'generation skill permission denied' using errcode = '42501';
  end if;
  perform 1 from public.generation_skills
    where id = target_skill_id and workspace_id = target_workspace_id and archived_at is null for update;
  if not found then raise exception 'generation skill is unavailable' using errcode = '42501'; end if;
  if char_length(markdown_content_value) not between 1 and 40000 or octet_length(markdown_content_value) > 65536 then
    raise exception 'generation skill content is outside the supported limit' using errcode = '22023';
  end if;
  computed_hash := encode(extensions.digest(convert_to(markdown_content_value, 'UTF8'), 'sha256'), 'hex');
  if content_sha256_value <> computed_hash then raise exception 'generation skill content hash mismatch' using errcode = '22023'; end if;
  select coalesce(max(version), 0) + 1 into next_version
    from public.generation_skill_versions where skill_id = target_skill_id;
  insert into public.generation_skill_versions (
    id, skill_id, workspace_id, version, original_filename, markdown_content, content_sha256, created_by
  ) values (
    version_uuid, target_skill_id, target_workspace_id, next_version, original_filename_value,
    markdown_content_value, computed_hash, actor
  );
  update public.generation_skills set active_version_id = version_uuid where id = target_skill_id;
  insert into public.audit_logs (workspace_id, actor_id, action, target_type, target_id, metadata)
    values (target_workspace_id, actor, 'generation_skill.version_created', 'generation_skill', target_skill_id,
      jsonb_build_object('version', next_version, 'contentSha256', computed_hash));
  return jsonb_build_object('skillId', target_skill_id, 'versionId', version_uuid, 'version', next_version, 'contentSha256', computed_hash);
end;
$$;

create function private.audit_generation_skill_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is distinct from old.archived_at then
    insert into public.audit_logs (workspace_id, actor_id, action, target_type, target_id, metadata)
      values (old.workspace_id, (select auth.uid()),
        case when new.archived_at is null then 'generation_skill.restored' else 'generation_skill.archived' end,
        'generation_skill', old.id, '{}'::jsonb);
  end if;
  if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id
    or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'generation skill ownership fields are immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger generation_skills_audit_archive
  before update on public.generation_skills
  for each row execute function private.audit_generation_skill_archive();

revoke all on function public.create_generation_skill(uuid, text, text, text, public.generation_skill_scope, text, text, text) from public, anon;
revoke all on function public.add_generation_skill_version(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.create_generation_skill(uuid, text, text, text, public.generation_skill_scope, text, text, text) to authenticated;
grant execute on function public.add_generation_skill_version(uuid, uuid, text, text, text) to authenticated;

revoke insert, update, delete on public.generation_skill_versions from authenticated;
revoke insert, update, delete on public.generation_skills from authenticated;
grant update (name, description, media_scope, archived_at) on public.generation_skills to authenticated;
revoke update on public.project_generation_skills from authenticated;
grant update (enabled, sort_order) on public.project_generation_skills to authenticated;
revoke update on public.projects from authenticated;
grant update (name, description, archived_at, deleted_at) on public.projects to authenticated;

comment on function public.create_generation_skill(uuid, text, text, text, public.generation_skill_scope, text, text, text)
  is 'Atomically creates a workspace-scoped inert Markdown Generation Skill and verifies its SHA-256.';
comment on function public.add_generation_skill_version(uuid, uuid, text, text, text)
  is 'Atomically appends and activates an immutable, hash-verified Generation Skill version.';
