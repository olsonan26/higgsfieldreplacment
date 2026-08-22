-- Cover Generation Skill foreign-key lookups reported by the hosted advisor.
create index generation_skill_versions_skill_workspace_idx
  on public.generation_skill_versions(skill_id, workspace_id);
create index generation_skills_active_version_idx
  on public.generation_skills(active_version_id, id)
  where active_version_id is not null;
create index project_generation_skills_skill_workspace_idx
  on public.project_generation_skills(skill_id, workspace_id);
create index generation_skill_snapshots_version_idx
  on public.generation_skill_snapshots(skill_version_id);
