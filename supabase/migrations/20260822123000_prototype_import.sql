-- One-time, explicit import of useful prototype browser metadata.
-- Imported jobs are historical and never create usage-ledger entries.
create table public.prototype_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  imported_by uuid not null references public.profiles(id) on delete restrict,
  source_key text not null check (source_key ~ '^[a-z][a-z0-9._-]{2,63}$'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  sanitized_payload jsonb not null check (jsonb_typeof(sanitized_payload) = 'object'),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  imported_at timestamptz not null default now(),
  unique (workspace_id, imported_by, source_key)
);
create index prototype_imports_project_idx on public.prototype_imports(project_id);

alter table public.prototype_imports enable row level security;
create policy prototype_imports_select on public.prototype_imports
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
grant select on public.prototype_imports to authenticated;

create function public.import_prototype_snapshot(
  target_workspace_id uuid,
  source_key_value text,
  payload_hash_value text,
  project_name_value text,
  sanitized_payload_value jsonb,
  summary_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing public.prototype_imports%rowtype;
  project_uuid uuid := gen_random_uuid();
  import_uuid uuid := gen_random_uuid();
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (select private.has_workspace_role(target_workspace_id, array['owner','admin','editor']::public.workspace_role[])) then
    raise exception 'prototype import permission denied' using errcode = '42501';
  end if;
  if source_key_value <> 'prototype-browser-v1' or payload_hash_value !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid prototype import identity' using errcode = '22023';
  end if;
  if char_length(project_name_value) not between 1 and 120
    or jsonb_typeof(sanitized_payload_value) <> 'object'
    or jsonb_typeof(summary_value) <> 'object'
    or octet_length(sanitized_payload_value::text) > 1048576 then
    raise exception 'invalid prototype import payload' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text || ':' || actor::text || ':prototype-browser-v1', 0));
  select * into existing from public.prototype_imports
    where workspace_id = target_workspace_id and imported_by = actor and source_key = source_key_value;
  if found then
    if existing.payload_hash <> payload_hash_value then
      raise exception 'prototype data was already imported for this account' using errcode = '23505';
    end if;
    return jsonb_build_object('importId', existing.id, 'projectId', existing.project_id, 'replayed', true, 'summary', existing.summary);
  end if;

  insert into public.projects (id, workspace_id, name, description, created_by)
    values (project_uuid, target_workspace_id, project_name_value, 'Imported prototype history — unverified metadata only.', actor);
  insert into public.prototype_imports (
    id, workspace_id, project_id, imported_by, source_key, payload_hash, sanitized_payload, summary
  ) values (
    import_uuid, target_workspace_id, project_uuid, actor, source_key_value,
    payload_hash_value, sanitized_payload_value, summary_value
  );
  insert into public.audit_logs (workspace_id, actor_id, action, target_type, target_id, metadata)
    values (target_workspace_id, actor, 'prototype.imported', 'prototype_import', import_uuid,
      jsonb_build_object('projectId', project_uuid, 'payloadHash', payload_hash_value, 'summary', summary_value));
  return jsonb_build_object('importId', import_uuid, 'projectId', project_uuid, 'replayed', false, 'summary', summary_value);
end;
$$;

revoke all on function public.import_prototype_snapshot(uuid, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.import_prototype_snapshot(uuid, text, text, text, jsonb, jsonb) to authenticated;
comment on table public.prototype_imports is 'Sanitized, one-time prototype metadata imports; never authoritative usage or spend.';
