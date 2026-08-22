-- Once an authoritative receipt arrives, release the estimate before counting
-- the recorded value so a generation is never double-counted against a cap.
create unique index usage_ledger_generation_release_unique
  on public.usage_ledger(generation_id, entry_kind)
  where generation_id is not null and entry_kind = 'estimate_released';

create or replace function public.reserve_generation_batch(
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
    select policy.estimated_credit_reserve into item_estimate
    from public.workspace_model_spend_policies policy
    where policy.workspace_id = target_workspace_id
      and policy.model_capability_id = (item ->> 'modelCapabilityId')::uuid
      and policy.enabled;
    if not found then
      raise exception 'model spending policy is not configured' using errcode = 'P0001';
    end if;
    total_estimate := total_estimate + item_estimate;
  end loop;

  select coalesce(sum(case
      when entry_kind in ('estimate_reserved', 'usage_recorded') then credits
      when entry_kind = 'estimate_released' then -credits
      else 0 end), 0) into month_reserved from public.usage_ledger
    where workspace_id = target_workspace_id
      and entry_kind in ('estimate_reserved', 'estimate_released', 'usage_recorded')
      and created_at >= date_trunc('month', now());
  if workspace_row.monthly_credit_limit > 0 and month_reserved + total_estimate > workspace_row.monthly_credit_limit then
    raise exception 'workspace spending limit reached' using errcode = 'P0001';
  end if;
  select coalesce(sum(case
      when entry_kind in ('estimate_reserved', 'usage_recorded') then credits
      when entry_kind = 'estimate_released' then -credits
      else 0 end), 0) into user_month_reserved from public.usage_ledger
    where workspace_id = target_workspace_id and actor_id = actor
      and entry_kind in ('estimate_reserved', 'estimate_released', 'usage_recorded')
      and created_at >= date_trunc('month', now());
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
    select policy.estimated_credit_reserve into item_estimate
    from public.workspace_model_spend_policies policy
    where policy.workspace_id = target_workspace_id
      and policy.model_capability_id = (item ->> 'modelCapabilityId')::uuid
      and policy.enabled;
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
