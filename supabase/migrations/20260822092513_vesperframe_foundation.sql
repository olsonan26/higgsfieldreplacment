-- VesperFrame durable multi-tenant foundation.
-- All application tables are deny-by-default, use authenticated membership RLS,
-- and keep system/provider mutations behind server-only credentials or narrowly
-- scoped SECURITY DEFINER functions that re-check auth.uid().

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.workspace_role as enum ('owner', 'admin', 'editor', 'viewer');
create type public.media_kind as enum ('image', 'video', 'audio', 'document', 'other');
create type public.asset_lifecycle_state as enum ('uploading', 'ready', 'quarantined', 'archived', 'deleted');
create type public.asset_role as enum (
  'source', 'reference_image', 'reference_video', 'reference_audio',
  'first_frame', 'last_frame', 'character', 'element', 'generated_output', 'thumbnail'
);
create type public.generation_state as enum (
  'reserved', 'submitting', 'submitted', 'queued', 'running',
  'ingesting', 'succeeded', 'failed', 'cancel_requested', 'cancelled', 'timed_out'
);
create type public.ledger_entry_kind as enum ('estimate_reserved', 'estimate_released', 'usage_recorded', 'adjustment');
create type public.webhook_event_state as enum ('received', 'processing', 'processed', 'rejected', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'VesperFrame creator' check (char_length(display_name) between 1 and 120),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  monthly_credit_limit numeric(14,4) not null default 25 check (monthly_credit_limit >= 0),
  daily_generation_limit integer not null default 20 check (daily_generation_limit between 1 and 10000),
  max_concurrent_generations smallint not null default 4 check (max_concurrent_generations between 1 and 100),
  retention_days integer not null default 90 check (retention_days between 1 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.workspace_role not null,
  generation_allowed boolean not null default true,
  monthly_credit_limit numeric(14,4) check (monthly_credit_limit is null or monthly_credit_limit >= 0),
  daily_generation_limit integer check (daily_generation_limit is null or daily_generation_limit between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_memberships_user_id_idx on public.workspace_memberships(user_id, workspace_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index projects_workspace_active_idx on public.projects(workspace_id, updated_at desc) where deleted_at is null;

create table public.model_capabilities (
  id uuid primary key default gen_random_uuid(),
  app_model_key text not null check (app_model_key ~ '^[a-z0-9][a-z0-9-]{1,95}$'),
  version integer not null check (version > 0),
  media_kind public.media_kind not null check (media_kind in ('image', 'video')),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  source_url text not null check (source_url ~ '^https://'),
  provider_schema_version text not null check (char_length(provider_schema_version) between 1 and 120),
  verified_at timestamptz not null,
  fixture_hash text not null check (fixture_hash ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (app_model_key, version)
);
create unique index model_capabilities_enabled_key_idx on public.model_capabilities(app_model_key) where enabled;

create table public.project_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version > 0),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (project_id, version),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete cascade
);
create index project_settings_latest_idx on public.project_settings(project_id, version desc);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  media_kind public.media_kind not null,
  storage_bucket text not null check (storage_bucket in ('vesperframe-sources', 'vesperframe-generated', 'vesperframe-thumbnails')),
  storage_path text not null,
  thumbnail_path text,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  safe_filename text not null check (char_length(safe_filename) between 1 and 255),
  mime_type text not null check (char_length(mime_type) between 3 and 127),
  byte_size bigint not null check (byte_size between 0 and 1073741824),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  lifecycle_state public.asset_lifecycle_state not null default 'uploading',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (storage_bucket, storage_path),
  unique (workspace_id, id)
);
create index assets_workspace_state_idx on public.assets(workspace_id, lifecycle_state, created_at desc);
create index assets_sha256_idx on public.assets(workspace_id, sha256) where sha256 is not null;

create table public.project_assets (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  role public.asset_role not null,
  role_label text check (role_label is null or char_length(role_label) <= 120),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (project_id, asset_id, role),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete cascade,
  foreign key (workspace_id, asset_id) references public.assets(workspace_id, id) on delete cascade
);
create index project_assets_asset_idx on public.project_assets(asset_id, project_id);

create table public.generation_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 160),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  requested_count smallint not null check (requested_count between 1 and 16),
  state text not null default 'reserved' check (state in ('reserved', 'submitting', 'partial', 'submitted', 'completed', 'failed')),
  estimated_credits numeric(14,4) not null default 0 check (estimated_credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, created_by, idempotency_key),
  unique (workspace_id, id),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete restrict
);
create index generation_batches_workspace_created_idx on public.generation_batches(workspace_id, created_at desc);

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.generation_batches(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  parent_generation_id uuid references public.generations(id) on delete set null,
  attempt_number smallint not null default 1 check (attempt_number between 1 and 100),
  ordinal smallint not null check (ordinal between 0 and 15),
  model_capability_id uuid not null references public.model_capabilities(id) on delete restrict,
  capability_version integer not null check (capability_version > 0),
  raw_prompt text not null check (char_length(raw_prompt) between 1 and 20000),
  compiled_prompt text not null check (char_length(compiled_prompt) between 1 and 30000),
  settings_snapshot jsonb not null check (jsonb_typeof(settings_snapshot) = 'object'),
  capability_snapshot jsonb not null check (jsonb_typeof(capability_snapshot) = 'object'),
  sanitized_request_snapshot jsonb not null check (jsonb_typeof(sanitized_request_snapshot) = 'object'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  provider_task_id text,
  state public.generation_state not null default 'reserved',
  progress smallint not null default 0 check (progress between 0 and 100),
  provider_result_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_result_metadata) = 'object'),
  estimated_credits numeric(14,4) not null default 0 check (estimated_credits >= 0),
  recorded_credits numeric(14,4) check (recorded_credits is null or recorded_credits >= 0),
  display_error_code text,
  display_error_message text check (display_error_message is null or char_length(display_error_message) <= 1000),
  callback_token_hash text not null check (callback_token_hash ~ '^[a-f0-9]{64}$'),
  reconciliation_attempts smallint not null default 0 check (reconciliation_attempts between 0 and 50),
  next_reconcile_at timestamptz,
  last_reconciled_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, ordinal),
  unique (workspace_id, id),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete restrict,
  foreign key (workspace_id, batch_id) references public.generation_batches(workspace_id, id) on delete restrict
);
create unique index generations_provider_task_idx on public.generations(provider_task_id) where provider_task_id is not null;
create index generations_workspace_state_idx on public.generations(workspace_id, state, created_at desc);
create index generations_reconcile_idx on public.generations(next_reconcile_at) where state in ('submitted', 'queued', 'running', 'ingesting');

create table public.generation_state_history (
  id bigint generated always as identity primary key,
  generation_id uuid not null references public.generations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  state public.generation_state not null,
  progress smallint not null check (progress between 0 and 100),
  source text not null check (source in ('reservation', 'submission', 'webhook', 'reconciliation', 'ingestion', 'user', 'system')),
  display_error_code text,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, generation_id) references public.generations(workspace_id, id) on delete cascade
);
create index generation_state_history_generation_idx on public.generation_state_history(generation_id, created_at);

create table public.generation_assets (
  generation_id uuid not null references public.generations(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  direction text not null check (direction in ('input', 'output')),
  role public.asset_role not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  primary key (generation_id, asset_id, direction, role),
  foreign key (workspace_id, generation_id) references public.generations(workspace_id, id) on delete cascade,
  foreign key (workspace_id, asset_id) references public.assets(workspace_id, id) on delete restrict
);

create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id uuid references public.generation_batches(id) on delete restrict,
  generation_id uuid references public.generations(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  entry_kind public.ledger_entry_kind not null,
  credits numeric(14,4) not null check (credits >= 0),
  authoritative boolean not null default false,
  external_record_hash text check (external_record_hash is null or external_record_hash ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index usage_ledger_workspace_created_idx on public.usage_ledger(workspace_id, created_at desc);
create unique index usage_ledger_generation_kind_unique on public.usage_ledger(generation_id, entry_kind) where generation_id is not null and entry_kind in ('estimate_reserved', 'usage_recorded');

create table public.provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  generation_id uuid not null references public.generations(id) on delete cascade,
  event_key text not null check (char_length(event_key) between 16 and 255),
  body_hash text not null check (body_hash ~ '^[a-f0-9]{64}$'),
  payload_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_summary) = 'object'),
  state public.webhook_event_state not null default 'received',
  display_error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (event_key),
  foreign key (workspace_id, generation_id) references public.generations(workspace_id, id) on delete cascade
);
create index webhook_events_generation_idx on public.provider_webhook_events(generation_id, received_at desc);

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope ~ '^[a-z][a-z0-9._-]{2,63}$'),
  key text not null check (char_length(key) between 16 and 160),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  resource_type text,
  resource_id uuid,
  response_status smallint check (response_status is null or response_status between 100 and 599),
  response_body jsonb,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  unique (workspace_id, actor_id, scope, key)
);
create index idempotency_expiry_idx on public.idempotency_keys(expires_at);

create table public.favorites (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id, asset_id),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete cascade,
  foreign key (workspace_id, asset_id) references public.assets(workspace_id, id) on delete cascade
);

create table public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version > 0),
  raw_prompt text not null default '' check (char_length(raw_prompt) <= 20000),
  compiled_prompt text not null default '' check (char_length(compiled_prompt) <= 30000),
  creative_direction jsonb not null default '{}'::jsonb check (jsonb_typeof(creative_direction) = 'object'),
  technical_settings jsonb not null default '{}'::jsonb check (jsonb_typeof(technical_settings) = 'object'),
  model_capability_id uuid references public.model_capabilities(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  restored_from_id uuid references public.prompt_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, version),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete cascade
);
create index prompt_versions_project_idx on public.prompt_versions(project_id, version desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action ~ '^[a-z][a-z0-9._-]{2,127}$'),
  target_type text not null check (target_type ~ '^[a-z][a-z0-9._-]{1,63}$'),
  target_id uuid,
  correlation_id text check (correlation_id is null or char_length(correlation_id) between 8 and 128),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_logs_workspace_created_idx on public.audit_logs(workspace_id, created_at desc);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger workspaces_set_updated_at before update on public.workspaces for each row execute function private.set_updated_at();
create trigger memberships_set_updated_at before update on public.workspace_memberships for each row execute function private.set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute function private.set_updated_at();
create trigger assets_set_updated_at before update on public.assets for each row execute function private.set_updated_at();
create trigger batches_set_updated_at before update on public.generation_batches for each row execute function private.set_updated_at();
create trigger generations_set_updated_at before update on public.generations for each row execute function private.set_updated_at();

create function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.workspace_memberships wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = (select auth.uid())
  );
$$;

create function private.has_workspace_role(target_workspace_id uuid, allowed_roles public.workspace_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.workspace_memberships wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role = any(allowed_roles)
  );
$$;

create function private.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) = target_user_id or exists (
    select 1
    from public.workspace_memberships mine
    join public.workspace_memberships theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = target_user_id
  );
$$;

create function private.storage_workspace_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on function private.is_workspace_member(uuid) from public;
revoke all on function private.has_workspace_role(uuid, public.workspace_role[]) from public;
revoke all on function private.can_view_profile(uuid) from public;
revoke all on function private.storage_workspace_id(text) from public;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.has_workspace_role(uuid, public.workspace_role[]) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;
grant execute on function private.storage_workspace_id(text) to authenticated;

create function private.bootstrap_new_user()
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
  insert into public.project_settings (workspace_id, project_id, version, settings, created_by)
    values (workspace_uuid, project_uuid, 1, '{"mediaKind":"video"}'::jsonb, new.id);
  insert into public.prompt_versions (workspace_id, project_id, version, created_by)
    values (workspace_uuid, project_uuid, 1, new.id);
  insert into public.audit_logs (workspace_id, actor_id, action, target_type, target_id, metadata)
    values (workspace_uuid, new.id, 'workspace.created', 'workspace', workspace_uuid, '{"source":"auth-bootstrap"}'::jsonb);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.bootstrap_new_user();

create function private.prevent_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') and not exists (
    select 1 from public.workspace_memberships wm
    where wm.workspace_id = old.workspace_id and wm.user_id <> old.user_id and wm.role = 'owner'
  ) then
    raise exception 'workspace must retain at least one owner' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger memberships_retain_owner before update of role or delete on public.workspace_memberships for each row execute function private.prevent_last_owner();

create function private.reject_immutable_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% records are immutable', tg_table_name using errcode = '55000';
end;
$$;
create trigger ledger_immutable before update or delete on public.usage_ledger for each row execute function private.reject_immutable_mutation();
create trigger capability_immutable before update or delete on public.model_capabilities for each row execute function private.reject_immutable_mutation();
create trigger prompt_version_immutable before update or delete on public.prompt_versions for each row execute function private.reject_immutable_mutation();
create trigger state_history_immutable before update or delete on public.generation_state_history for each row execute function private.reject_immutable_mutation();
create trigger audit_immutable before update or delete on public.audit_logs for each row execute function private.reject_immutable_mutation();

create function private.record_generation_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.state is distinct from old.state or new.progress is distinct from old.progress then
    insert into public.generation_state_history (generation_id, workspace_id, state, progress, source, display_error_code)
    values (
      new.id,
      new.workspace_id,
      new.state,
      new.progress,
      case when tg_op = 'INSERT' then 'reservation' else coalesce(current_setting('app.generation_state_source', true), 'system') end,
      new.display_error_code
    );
  end if;
  return new;
end;
$$;
create trigger generations_record_state after insert or update of state, progress on public.generations for each row execute function private.record_generation_state();

create function public.reserve_generation_batch(
  target_workspace_id uuid,
  target_project_id uuid,
  idempotency_key_value text,
  request_hash_value text,
  items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  membership public.workspace_memberships%rowtype;
  workspace_row public.workspaces%rowtype;
  existing public.idempotency_keys%rowtype;
  batch_uuid uuid := gen_random_uuid();
  item jsonb;
  item_count integer;
  item_index integer := 0;
  item_estimate numeric(14,4);
  total_estimate numeric(14,4) := 0;
  month_reserved numeric(14,4);
  user_month_reserved numeric(14,4);
  daily_count integer;
  concurrent_count integer;
  generation_uuid uuid;
  generation_results jsonb := '[]'::jsonb;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if char_length(idempotency_key_value) not between 16 and 160 or request_hash_value !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid idempotency request' using errcode = '22023';
  end if;
  if jsonb_typeof(items) <> 'array' then raise exception 'items must be an array' using errcode = '22023'; end if;
  item_count := jsonb_array_length(items);
  if item_count not between 1 and 16 then raise exception 'batch size is outside the supported range' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text || ':' || actor::text || ':' || idempotency_key_value, 0));

  select * into membership from public.workspace_memberships
    where workspace_id = target_workspace_id and user_id = actor for update;
  if not found or membership.role not in ('owner', 'admin', 'editor') or not membership.generation_allowed then
    raise exception 'generation permission denied' using errcode = '42501';
  end if;
  select * into workspace_row from public.workspaces where id = target_workspace_id for update;
  if not exists (
    select 1 from public.projects p
    where p.id = target_project_id and p.workspace_id = target_workspace_id
      and p.archived_at is null and p.deleted_at is null
  ) then raise exception 'project not available' using errcode = '42501'; end if;

  select * into existing from public.idempotency_keys
    where workspace_id = target_workspace_id and actor_id = actor
      and scope = 'generation.batch' and key = idempotency_key_value;
  if found then
    if existing.request_hash <> request_hash_value then
      raise exception 'idempotency key already used for a different request' using errcode = '23505';
    end if;
    return coalesce(existing.response_body, jsonb_build_object('batchId', existing.resource_id, 'replayed', true)) || jsonb_build_object('replayed', true);
  end if;

  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item) <> 'object' then raise exception 'each item must be an object' using errcode = '22023'; end if;
    item_estimate := coalesce((item ->> 'estimatedCredits')::numeric, 0);
    if item_estimate < 0 or item_estimate > 100000 then raise exception 'invalid credit estimate' using errcode = '22023'; end if;
    total_estimate := total_estimate + item_estimate;
  end loop;

  select coalesce(sum(credits), 0) into month_reserved from public.usage_ledger
    where workspace_id = target_workspace_id and entry_kind in ('estimate_reserved', 'usage_recorded')
      and created_at >= date_trunc('month', now());
  if workspace_row.monthly_credit_limit > 0 and month_reserved + total_estimate > workspace_row.monthly_credit_limit then
    raise exception 'workspace spending limit reached' using errcode = 'P0001';
  end if;
  select coalesce(sum(credits), 0) into user_month_reserved from public.usage_ledger
    where workspace_id = target_workspace_id and actor_id = actor
      and entry_kind in ('estimate_reserved', 'usage_recorded') and created_at >= date_trunc('month', now());
  if membership.monthly_credit_limit is not null and user_month_reserved + total_estimate > membership.monthly_credit_limit then
    raise exception 'user spending limit reached' using errcode = 'P0001';
  end if;

  select count(*) into daily_count from public.generations
    where workspace_id = target_workspace_id and created_by = actor and created_at >= date_trunc('day', now());
  if daily_count + item_count > least(workspace_row.daily_generation_limit, coalesce(membership.daily_generation_limit, workspace_row.daily_generation_limit)) then
    raise exception 'daily generation limit reached' using errcode = 'P0001';
  end if;
  if (select count(*) from public.generation_batches where workspace_id = target_workspace_id and created_by = actor and created_at >= now() - interval '1 minute') >= 10 then
    raise exception 'generation rate limit reached' using errcode = 'P0001';
  end if;
  select count(*) into concurrent_count from public.generations
    where workspace_id = target_workspace_id and state in ('reserved', 'submitting', 'submitted', 'queued', 'running', 'ingesting');
  if concurrent_count + item_count > workspace_row.max_concurrent_generations then
    raise exception 'workspace concurrency limit reached' using errcode = 'P0001';
  end if;

  insert into public.idempotency_keys (workspace_id, actor_id, scope, key, request_hash, resource_type, resource_id)
    values (target_workspace_id, actor, 'generation.batch', idempotency_key_value, request_hash_value, 'generation_batch', batch_uuid);
  insert into public.generation_batches (id, workspace_id, project_id, created_by, idempotency_key, request_hash, requested_count, estimated_credits)
    values (batch_uuid, target_workspace_id, target_project_id, actor, idempotency_key_value, request_hash_value, item_count, total_estimate);

  for item in select value from jsonb_array_elements(items) loop
    generation_uuid := gen_random_uuid();
    item_estimate := coalesce((item ->> 'estimatedCredits')::numeric, 0);
    insert into public.generations (
      id, batch_id, workspace_id, project_id, ordinal, model_capability_id, capability_version,
      raw_prompt, compiled_prompt, settings_snapshot, capability_snapshot, sanitized_request_snapshot,
      request_hash, callback_token_hash, estimated_credits, created_by
    ) values (
      generation_uuid, batch_uuid, target_workspace_id, target_project_id, item_index,
      (item ->> 'modelCapabilityId')::uuid, (item ->> 'capabilityVersion')::integer,
      item ->> 'rawPrompt', item ->> 'compiledPrompt', item -> 'settingsSnapshot',
      item -> 'capabilitySnapshot', item -> 'sanitizedRequestSnapshot', item ->> 'requestHash',
      item ->> 'callbackTokenHash', item_estimate, actor
    );
    insert into public.usage_ledger (workspace_id, batch_id, generation_id, actor_id, entry_kind, credits, authoritative, metadata)
      values (target_workspace_id, batch_uuid, generation_uuid, actor, 'estimate_reserved', item_estimate, false, '{"status":"estimated"}'::jsonb);
    generation_results := generation_results || jsonb_build_array(jsonb_build_object('id', generation_uuid, 'ordinal', item_index, 'state', 'reserved'));
    item_index := item_index + 1;
  end loop;

  insert into public.audit_logs (workspace_id, actor_id, action, target_type, target_id, metadata)
    values (target_workspace_id, actor, 'generation.batch_reserved', 'generation_batch', batch_uuid, jsonb_build_object('count', item_count, 'estimatedCredits', total_estimate));
  update public.idempotency_keys set response_status = 201,
    response_body = jsonb_build_object('batchId', batch_uuid, 'generations', generation_results, 'replayed', false)
    where workspace_id = target_workspace_id and actor_id = actor and scope = 'generation.batch' and key = idempotency_key_value;

  return jsonb_build_object('batchId', batch_uuid, 'generations', generation_results, 'replayed', false);
end;
$$;
revoke all on function public.reserve_generation_batch(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.reserve_generation_batch(uuid, uuid, text, text, jsonb) to authenticated;

-- Enable RLS on every exposed application table.
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.projects enable row level security;
alter table public.project_settings enable row level security;
alter table public.model_capabilities enable row level security;
alter table public.assets enable row level security;
alter table public.project_assets enable row level security;
alter table public.generation_batches enable row level security;
alter table public.generations enable row level security;
alter table public.generation_state_history enable row level security;
alter table public.generation_assets enable row level security;
alter table public.usage_ledger enable row level security;
alter table public.provider_webhook_events enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.favorites enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select on public.profiles for select to authenticated using ((select private.can_view_profile(id)));
create policy profiles_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy workspaces_select on public.workspaces for select to authenticated using ((select private.is_workspace_member(id)));
create policy workspaces_update on public.workspaces for update to authenticated
  using ((select private.has_workspace_role(id, array['owner','admin']::public.workspace_role[])))
  with check ((select private.has_workspace_role(id, array['owner','admin']::public.workspace_role[])));

create policy memberships_select on public.workspace_memberships for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy memberships_insert on public.workspace_memberships for insert to authenticated
  with check ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));
create policy memberships_update on public.workspace_memberships for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])))
  with check ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));
create policy memberships_delete on public.workspace_memberships for delete to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));

create policy projects_select on public.projects for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy projects_insert on public.projects for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])));
create policy projects_update on public.projects for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])))
  with check ((select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])));
create policy projects_delete on public.projects for delete to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner']::public.workspace_role[])));

create policy project_settings_select on public.project_settings for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy project_settings_insert on public.project_settings for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])));

create policy model_capabilities_select on public.model_capabilities for select to authenticated using (enabled);

create policy assets_select on public.assets for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy assets_insert on public.assets for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])));
create policy assets_update on public.assets for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])))
  with check ((select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])));
create policy assets_delete on public.assets for delete to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));

create policy project_assets_select on public.project_assets for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy project_assets_insert on public.project_assets for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])));
create policy project_assets_update on public.project_assets for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])))
  with check ((select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])));
create policy project_assets_delete on public.project_assets for delete to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])));

create policy generation_batches_select on public.generation_batches for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy generations_select on public.generations for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy generations_archive on public.generations for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])))
  with check ((select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])));
create policy generation_state_history_select on public.generation_state_history for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy generation_assets_select on public.generation_assets for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy usage_ledger_select on public.usage_ledger for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy webhook_events_select on public.provider_webhook_events for select to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));
create policy idempotency_select on public.idempotency_keys for select to authenticated
  using (actor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));

create policy favorites_select on public.favorites for select to authenticated using (user_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));
create policy favorites_insert on public.favorites for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])));
create policy favorites_delete on public.favorites for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])));

create policy prompt_versions_select on public.prompt_versions for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy prompt_versions_insert on public.prompt_versions for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])));
create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.workspaces, public.workspace_memberships, public.projects,
  public.project_settings, public.model_capabilities, public.assets, public.project_assets,
  public.generation_batches, public.generations, public.generation_state_history, public.generation_assets,
  public.usage_ledger, public.provider_webhook_events, public.idempotency_keys, public.favorites,
  public.prompt_versions, public.audit_logs to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;
grant update (name, slug, monthly_credit_limit, daily_generation_limit, max_concurrent_generations, retention_days) on public.workspaces to authenticated;
grant insert, update, delete on public.workspace_memberships to authenticated;
grant insert, update, delete on public.projects to authenticated;
grant insert on public.project_settings to authenticated;
grant insert, update, delete on public.assets to authenticated;
grant insert, update, delete on public.project_assets to authenticated;
grant update (archived_at) on public.generations to authenticated;
grant insert, delete on public.favorites to authenticated;
grant insert on public.prompt_versions to authenticated;

-- Three private buckets. Object paths must start with the workspace UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('vesperframe-sources', 'vesperframe-sources', false, 104857600, array['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav','audio/mp4']),
  ('vesperframe-generated', 'vesperframe-generated', false, 1073741824, array['image/jpeg','image/png','image/webp','video/mp4','video/webm']),
  ('vesperframe-thumbnails', 'vesperframe-thumbnails', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy storage_member_read on storage.objects for select to authenticated
  using (bucket_id in ('vesperframe-sources','vesperframe-generated','vesperframe-thumbnails')
    and (select private.is_workspace_member(private.storage_workspace_id(name))));
create policy storage_editor_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'vesperframe-sources'
    and (select private.has_workspace_role(private.storage_workspace_id(name), array['owner','admin','editor']::public.workspace_role[])));
create policy storage_editor_update on storage.objects for update to authenticated
  using (bucket_id = 'vesperframe-sources'
    and (select private.has_workspace_role(private.storage_workspace_id(name), array['owner','admin','editor']::public.workspace_role[])))
  with check (bucket_id = 'vesperframe-sources'
    and (select private.has_workspace_role(private.storage_workspace_id(name), array['owner','admin','editor']::public.workspace_role[])));
create policy storage_admin_delete on storage.objects for delete to authenticated
  using (bucket_id in ('vesperframe-sources','vesperframe-generated','vesperframe-thumbnails')
    and (select private.has_workspace_role(private.storage_workspace_id(name), array['owner','admin']::public.workspace_role[])));

comment on table public.usage_ledger is 'Append-only authoritative and estimated usage entries. Browser-local receipts are never imported here.';
comment on column public.generations.sanitized_request_snapshot is 'Credential-free, callback-free request preview. Never store signed URLs or raw provider responses.';
comment on function public.reserve_generation_batch(uuid, uuid, text, text, jsonb) is 'Atomically checks authenticated membership, quota, rate and concurrency limits before reserving a durable batch and items.';
