-- Follow-up from hosted security/performance advisors.

-- Capability versions are immutable. Multiple historical versions may be
-- enabled; application selection always uses the greatest verified version.
drop index if exists public.model_capabilities_enabled_key_idx;

-- Remove the implicit PUBLIC EXECUTE privilege from trigger and helper
-- functions. Only the four membership/storage policy helpers are callable by
-- authenticated SQL roles; the private schema is not exposed through PostgREST.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.has_workspace_role(uuid, public.workspace_role[]) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;
grant execute on function private.storage_workspace_id(text) to authenticated;

-- Cover every foreign-key access path reported by the hosted advisor. Some
-- indexes intentionally overlap a primary key because their leading columns
-- serve a different workspace- or actor-scoped query.
create index assets_created_by_idx on public.assets(created_by);
create index audit_logs_actor_idx on public.audit_logs(actor_id);
create index favorites_user_idx on public.favorites(user_id);
create index favorites_workspace_project_idx on public.favorites(workspace_id, project_id);
create index favorites_workspace_asset_idx on public.favorites(workspace_id, asset_id);
create index generation_assets_asset_idx on public.generation_assets(asset_id);
create index generation_assets_workspace_generation_idx on public.generation_assets(workspace_id, generation_id);
create index generation_assets_workspace_asset_idx on public.generation_assets(workspace_id, asset_id);
create index generation_batches_created_by_idx on public.generation_batches(created_by);
create index generation_batches_project_idx on public.generation_batches(project_id);
create index generation_batches_workspace_project_idx on public.generation_batches(workspace_id, project_id);
create index generation_state_history_workspace_generation_idx on public.generation_state_history(workspace_id, generation_id);
create index generations_created_by_idx on public.generations(created_by);
create index generations_capability_idx on public.generations(model_capability_id);
create index generations_parent_idx on public.generations(parent_generation_id);
create index generations_project_idx on public.generations(project_id);
create index generations_workspace_batch_idx on public.generations(workspace_id, batch_id);
create index generations_workspace_project_idx on public.generations(workspace_id, project_id);
create index idempotency_actor_idx on public.idempotency_keys(actor_id);
create index project_assets_created_by_idx on public.project_assets(created_by);
create index project_assets_workspace_project_idx on public.project_assets(workspace_id, project_id);
create index project_assets_workspace_asset_idx on public.project_assets(workspace_id, asset_id);
create index project_settings_created_by_idx on public.project_settings(created_by);
create index project_settings_workspace_project_idx on public.project_settings(workspace_id, project_id);
create index projects_created_by_idx on public.projects(created_by);
create index prompt_versions_created_by_idx on public.prompt_versions(created_by);
create index prompt_versions_capability_idx on public.prompt_versions(model_capability_id);
create index prompt_versions_restored_from_idx on public.prompt_versions(restored_from_id);
create index prompt_versions_workspace_project_idx on public.prompt_versions(workspace_id, project_id);
create index webhook_events_workspace_generation_idx on public.provider_webhook_events(workspace_id, generation_id);
create index usage_ledger_actor_idx on public.usage_ledger(actor_id);
create index usage_ledger_batch_idx on public.usage_ledger(batch_id);
create index workspaces_owner_idx on public.workspaces(owner_id);
