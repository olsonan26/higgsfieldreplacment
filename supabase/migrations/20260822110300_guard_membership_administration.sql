-- Prevent privilege escalation through direct Data API membership mutations.
create or replace function private.guard_membership_administration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_role public.workspace_role;
  target_workspace uuid := case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;
begin
  -- Trusted database/service operations have no authenticated end-user claim.
  if actor is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and (
    new.workspace_id is distinct from old.workspace_id or
    new.user_id is distinct from old.user_id or
    new.created_at is distinct from old.created_at
  ) then
    raise exception 'membership ownership fields are immutable' using errcode = '55000';
  end if;

  select wm.role into actor_role
  from public.workspace_memberships wm
  where wm.workspace_id = target_workspace and wm.user_id = actor;

  if actor_role = 'owner' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if actor_role <> 'admin' then
    raise exception 'membership administration denied' using errcode = '42501';
  end if;

  if (tg_op in ('UPDATE', 'DELETE') and old.role in ('owner', 'admin'))
    or (tg_op in ('INSERT', 'UPDATE') and new.role in ('owner', 'admin')) then
    raise exception 'only an owner may manage owner or admin memberships' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists memberships_guard_administration on public.workspace_memberships;
create trigger memberships_guard_administration
  before insert or update or delete on public.workspace_memberships
  for each row execute function private.guard_membership_administration();

revoke update on public.workspace_memberships from authenticated;
grant update (role, generation_allowed, monthly_credit_limit, daily_generation_limit)
  on public.workspace_memberships to authenticated;

comment on function private.guard_membership_administration()
  is 'Enforces owner/admin delegation boundaries even when the Data API is called directly.';
