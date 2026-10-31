-- Busy admin lists (docs/specs/owner-admin.md, "Busy lists").
--
-- Every owner admin list is searched and filtered the same way, by the
-- database, 50 rows at a time. The audit log does it with plain filters on
-- admin_audit. Deletions needs a join to find people by name, email or house,
-- so it gets three functions: the matching rows, a page of them soonest
-- first, and how many there are. Additive: owner_deletions() stays.

-- Who is waiting to be deleted and matches the search: the words (a name,
-- email or house that has them, or an account id that starts with them),
-- who started it ('self' in the app, 'owner' for someone who emailed),
-- whether it goes within a day or a week, and when they asked.
create function public.owner_deletions_find(
  p_q text default '',
  p_by text default null,
  p_goes text default null,
  p_after timestamptz default null,
  p_before timestamptz default null
)
returns table (
  user_id uuid,
  name text,
  email text,
  house_name text,
  requested_at timestamptz,
  delete_after timestamptz,
  requested_by text
)
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  -- What was typed, with LIKE's own wildcards taken as letters.
  q text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  return query
    select d.user_id, p.display_name, u.email::text, h.name, d.requested_at, d.delete_after, d.requested_by
    from public.account_deletions d
    join public.profiles p on p.id = d.user_id
    left join auth.users u on u.id = d.user_id
    left join public.members m on m.user_id = d.user_id
    left join public.houses h on h.id = m.house_id
    where d.state = 'pending'
      and (p_by is null or d.requested_by = p_by)
      and (p_goes is null
        or d.delete_after <= now() + case p_goes when 'day' then interval '1 day' else interval '7 days' end)
      and (p_after is null or d.requested_at > p_after)
      and (p_before is null or d.requested_at <= p_before)
      and (q = ''
        or d.user_id::text like q || '%'
        or lower(p.display_name) like '%' || q || '%'
        or lower(u.email::text) like '%' || q || '%'
        or lower(h.name) like '%' || q || '%');
end;
$$;

-- A page of them, soonest first, after the last one shown (its delete_after and user_id).
create function public.owner_deletions_page(
  p_q text default '',
  p_by text default null,
  p_goes text default null,
  p_after timestamptz default null,
  p_before timestamptz default null,
  p_cursor_at timestamptz default null,
  p_cursor_user uuid default null,
  p_limit integer default 51
)
returns table (
  user_id uuid,
  name text,
  email text,
  house_name text,
  requested_at timestamptz,
  delete_after timestamptz,
  requested_by text
)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  return query
    select f.*
    from public.owner_deletions_find(p_q, p_by, p_goes, p_after, p_before) f
    where p_cursor_at is null or (f.delete_after, f.user_id) > (p_cursor_at, p_cursor_user)
    order by f.delete_after, f.user_id
    limit least(greatest(coalesce(p_limit, 51), 1), 201);
end;
$$;

-- How many match.
create function public.owner_deletions_count(
  p_q text default '',
  p_by text default null,
  p_goes text default null,
  p_after timestamptz default null,
  p_before timestamptz default null
)
returns bigint
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  return (select count(*) from public.owner_deletions_find(p_q, p_by, p_goes, p_after, p_before));
end;
$$;

revoke execute on function
  public.owner_deletions_find(text, text, text, timestamptz, timestamptz),
  public.owner_deletions_page(text, text, text, timestamptz, timestamptz, timestamptz, uuid, integer),
  public.owner_deletions_count(text, text, text, timestamptz, timestamptz)
from public, anon, authenticated;
grant execute on function
  public.owner_deletions_page(text, text, text, timestamptz, timestamptz, timestamptz, uuid, integer),
  public.owner_deletions_count(text, text, text, timestamptz, timestamptz)
to authenticated;
