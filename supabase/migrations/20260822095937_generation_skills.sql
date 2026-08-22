-- Workspace-scoped Generation Skills are inert Markdown prompt directives.
-- They are never interpreted as executable code or trusted application instructions.

create type public.generation_skill_scope as enum ('image', 'video', 'both');

create table public.generation_skills (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  description text not null default '' check (char_length(description) <= 500),
  media_scope public.generation_skill_scope not null default 'both',
  active_version_id uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (workspace_id, slug),
  unique (id, workspace_id)
);
create index generation_skills_workspace_active_idx
  on public.generation_skills(workspace_id, updated_at desc) where archived_at is null;
create index generation_skills_created_by_idx on public.generation_skills(created_by);

create table public.generation_skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null,
  workspace_id uuid not null,
  version integer not null check (version > 0),
  original_filename text not null check (
    char_length(original_filename) between 4 and 160
    and lower(original_filename) like '%.md'
    and original_filename !~ '[\\/\x00-\x1f]'
  ),
  markdown_content text not null check (
    char_length(markdown_content) between 1 and 40000
    and octet_length(markdown_content) <= 65536
  ),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (skill_id, version),
  unique (id, skill_id),
  constraint generation_skill_versions_skill_workspace_fk
    foreign key (skill_id, workspace_id)
    references public.generation_skills(id, workspace_id) on delete cascade
);
create index generation_skill_versions_workspace_idx
  on public.generation_skill_versions(workspace_id, created_at desc);
create index generation_skill_versions_created_by_idx on public.generation_skill_versions(created_by);

alter table public.generation_skills
  add constraint generation_skills_active_version_fk
  foreign key (active_version_id, id)
  references public.generation_skill_versions(id, skill_id)
  deferrable initially immediate;

create table public.project_generation_skills (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  skill_id uuid not null references public.generation_skills(id) on delete cascade,
  enabled boolean not null default true,
  sort_order smallint not null default 0 check (sort_order between 0 and 100),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (project_id, skill_id),
  constraint project_generation_skills_project_workspace_fk
    foreign key (workspace_id, project_id)
    references public.projects(workspace_id, id) on delete cascade,
  constraint project_generation_skills_skill_workspace_fk
    foreign key (skill_id, workspace_id)
    references public.generation_skills(id, workspace_id) on delete cascade
);
create index project_generation_skills_workspace_idx
  on public.project_generation_skills(workspace_id, project_id, sort_order);
create index project_generation_skills_created_by_idx on public.project_generation_skills(created_by);

create table public.generation_skill_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  generation_id uuid not null references public.generations(id) on delete cascade,
  skill_id uuid not null references public.generation_skills(id) on delete restrict,
  skill_version_id uuid not null references public.generation_skill_versions(id) on delete restrict,
  position smallint not null check (position between 0 and 4),
  name_snapshot text not null,
  media_scope_snapshot public.generation_skill_scope not null,
  markdown_content_snapshot text not null,
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (generation_id, position),
  unique (generation_id, skill_version_id)
);
create index generation_skill_snapshots_workspace_idx
  on public.generation_skill_snapshots(workspace_id, generation_id);
create index generation_skill_snapshots_skill_idx
  on public.generation_skill_snapshots(skill_id, created_at desc);

create trigger generation_skills_set_updated_at
  before update on public.generation_skills
  for each row execute function private.set_updated_at();
create trigger generation_skill_versions_immutable
  before update or delete on public.generation_skill_versions
  for each row execute function private.reject_immutable_mutation();
create trigger generation_skill_snapshots_immutable
  before update or delete on public.generation_skill_snapshots
  for each row execute function private.reject_immutable_mutation();

create function private.snapshot_generation_skills()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected jsonb;
  selected_count integer;
  selected_position integer := 0;
  version_uuid uuid;
  skill_row record;
  generation_media_kind public.media_kind;
begin
  selected := coalesce(new.settings_snapshot -> 'skills', '[]'::jsonb);
  if jsonb_typeof(selected) <> 'array' then
    raise exception 'settings_snapshot.skills must be an array' using errcode = '22023';
  end if;
  selected_count := jsonb_array_length(selected);
  if selected_count > 5 then
    raise exception 'at most five generation skills may be selected' using errcode = '22023';
  end if;

  select media_kind into generation_media_kind
  from public.model_capabilities where id = new.model_capability_id;

  for selected in select value from jsonb_array_elements(selected) loop
    if jsonb_typeof(selected) <> 'object' or not (selected ? 'versionId') then
      raise exception 'each selected skill requires a versionId' using errcode = '22023';
    end if;
    begin
      version_uuid := (selected ->> 'versionId')::uuid;
    exception when invalid_text_representation then
      raise exception 'selected skill version is invalid' using errcode = '22023';
    end;

    select skill.id as skill_id, skill.name, skill.media_scope,
      version.id as version_id, version.markdown_content, version.content_sha256
    into skill_row
    from public.generation_skill_versions version
    join public.generation_skills skill on skill.id = version.skill_id
    where version.id = version_uuid
      and version.workspace_id = new.workspace_id
      and skill.workspace_id = new.workspace_id
      and skill.archived_at is null
      and skill.active_version_id = version.id;
    if not found then
      raise exception 'selected generation skill is unavailable' using errcode = '42501';
    end if;
    if skill_row.media_scope <> 'both'
      and skill_row.media_scope::text <> generation_media_kind::text then
      raise exception 'selected generation skill does not support this media kind' using errcode = '22023';
    end if;

    insert into public.generation_skill_snapshots (
      workspace_id, generation_id, skill_id, skill_version_id, position,
      name_snapshot, media_scope_snapshot, markdown_content_snapshot, content_sha256
    ) values (
      new.workspace_id, new.id, skill_row.skill_id, skill_row.version_id,
      selected_position, skill_row.name, skill_row.media_scope,
      skill_row.markdown_content, skill_row.content_sha256
    );
    selected_position := selected_position + 1;
  end loop;
  return new;
end;
$$;
create trigger generations_snapshot_selected_skills
  after insert on public.generations
  for each row execute function private.snapshot_generation_skills();

alter table public.generation_skills enable row level security;
alter table public.generation_skill_versions enable row level security;
alter table public.project_generation_skills enable row level security;
alter table public.generation_skill_snapshots enable row level security;

create policy generation_skills_select on public.generation_skills
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy generation_skills_insert on public.generation_skills
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and (select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[]))
  );
create policy generation_skills_update on public.generation_skills
  for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])))
  with check ((select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])));
create policy generation_skills_delete on public.generation_skills
  for delete to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[])));

create policy generation_skill_versions_select on public.generation_skill_versions
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy generation_skill_versions_insert on public.generation_skill_versions
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and (select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[]))
  );

create policy project_generation_skills_select on public.project_generation_skills
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy project_generation_skills_insert on public.project_generation_skills
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and (select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[]))
  );
create policy project_generation_skills_update on public.project_generation_skills
  for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])))
  with check ((select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])));
create policy project_generation_skills_delete on public.project_generation_skills
  for delete to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner','admin','editor']::public.workspace_role[])));

create policy generation_skill_snapshots_select on public.generation_skill_snapshots
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));

revoke all on public.generation_skills from anon, authenticated;
revoke all on public.generation_skill_versions from anon, authenticated;
revoke all on public.project_generation_skills from anon, authenticated;
revoke all on public.generation_skill_snapshots from anon, authenticated;
grant select, insert, update, delete on public.generation_skills to authenticated;
grant select, insert on public.generation_skill_versions to authenticated;
grant select, insert, update, delete on public.project_generation_skills to authenticated;
grant select on public.generation_skill_snapshots to authenticated;

comment on table public.generation_skills is 'Workspace-scoped, inert Markdown generation guidance selected explicitly by users.';
comment on table public.generation_skill_versions is 'Immutable normalized Markdown versions; content is never executed.';
comment on table public.generation_skill_snapshots is 'Immutable exact skill text and hash used for each generation.';
