-- Report a problem, step 1 (docs/specs/report-a-problem.md).
--
-- Someone tells Jonz about a problem, an idea or a question from inside the
-- app, with up to three screenshots and, if they say so, the details that
-- help find it. They see it again under Your reports with every reply. The
-- owner answers from the admin Inbox. Additive: two new tables, a private
-- bucket, and functions; finish_account_deletion also clears screenshots.

-- --- The reports -----------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  -- Who sent it. Once their account is deleted their profile says "Someone
  -- who left", no email shows and the screenshots are gone; what they said
  -- stays.
  user_id uuid references auth.users (id) on delete set null,
  -- Their house when they sent it.
  house_id uuid references public.houses (id) on delete set null,
  kind text not null check (kind in ('problem', 'idea', 'question')),
  -- new: nobody at Jonz has read it (or they wrote back since), open: read,
  -- not answered, replied, fixed.
  state text not null default 'new' check (state in ('new', 'open', 'replied', 'fixed')),
  words text not null check (char_length(words) between 1 and 2000),
  -- What the app sent with it, when they ticked "Send the details that help":
  -- the pages they were on, the app or browser, the house and week, the last
  -- error. Short sentences, never more.
  details jsonb check (details is null or (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4000)),
  -- Paths in the report-shots bucket, under the sender's own folder.
  shots text[] not null default '{}' check (cardinality(shots) <= 3),
  created_at timestamptz not null default now(),
  -- The last thing said on it, by either side.
  updated_at timestamptz not null default now(),
  -- When its sender last opened it: a reply after this is one to read.
  seen_at timestamptz not null default now()
);

create index reports_user on public.reports (user_id, created_at desc);
create index reports_created on public.reports (created_at desc, id desc);
create index reports_waiting on public.reports (created_at desc, id desc) where state in ('new', 'open');

-- The conversation after the first words: Jonz's replies, and the sender writing back.
create table public.report_messages (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports (id) on delete cascade,
  from_owner boolean not null,
  -- Who wrote it. Not a foreign key, as in the audit log.
  author uuid,
  -- The name a reply from Jonz is signed with ("Glyn at Jonz"), as it was then.
  author_name text,
  body text not null check (char_length(body) between 1 and 2000),
  at timestamptz not null default now()
);

create index report_messages_report on public.report_messages (report_id, at);

alter table public.reports enable row level security;
alter table public.report_messages enable row level security;

create policy "you read the reports you sent" on public.reports
  for select to authenticated using (user_id = (select auth.uid()));
create policy "you read the replies to yours" on public.report_messages
  for select to authenticated
  using (exists (select 1 from public.reports r where r.id = report_id and r.user_id = (select auth.uid())));

-- Every change goes through the functions below; the owner reads through them too.
revoke all on public.reports, public.report_messages from public, anon, authenticated;
grant select on public.reports, public.report_messages to authenticated;
grant select on public.reports, public.report_messages to service_role;

-- --- Screenshots -----------------------------------------------------------------------

-- Private: the sender and the owner (with their code) can open them, nobody else.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-shots', 'report-shots', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "upload screenshots for a report" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'report-shots' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "see your screenshots, or any as the owner" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-shots'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_owner()))
  );

-- --- Sending, and the sender's side ------------------------------------------------------

-- Send a report. Five a day each, so a stuck button can't fill the Inbox.
-- Screenshots must already be uploaded to the sender's own folder.
create function public.send_report(
  p_kind text,
  p_words text,
  p_details jsonb default null,
  p_shots text[] default '{}'
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  words text := btrim(coalesce(p_words, ''));
  shots text[] := coalesce(p_shots, '{}');
  shot text;
  home uuid;
  made uuid;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('problem', 'idea', 'question') then
    raise exception 'report_kind' using errcode = 'P0001';
  end if;
  if char_length(words) not between 1 and 2000 then
    raise exception 'report_words' using errcode = 'P0001';
  end if;
  if cardinality(shots) > 3 then
    raise exception 'report_shot' using errcode = 'P0001';
  end if;
  foreach shot in array shots loop
    if shot is null
      or shot !~ ('^' || me::text || '/[0-9a-f-]{36}\.jpg$')
      or not exists (select 1 from storage.objects o where o.bucket_id = 'report-shots' and o.name = shot) then
      raise exception 'report_shot' using errcode = 'P0001';
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended('jonz.reports:' || me::text, 0));
  if (select count(*) from public.reports r where r.user_id = me and r.created_at > now() - interval '1 day') >= 5 then
    raise exception 'report_limit' using errcode = 'P0001';
  end if;

  select m.house_id into home from public.members m where m.user_id = me;
  insert into public.reports (user_id, house_id, kind, words, details, shots)
  values (me, home, p_kind, words, p_details, shots)
  returning id into made;
  return made;
end;
$$;

-- Your reports, newest first, with how many replies each has and whether one is unread.
create function public.my_reports()
returns table (
  id uuid,
  kind text,
  state text,
  words text,
  created_at timestamptz,
  updated_at timestamptz,
  replies integer,
  unread boolean
)
language sql
stable
security definer set search_path = ''
as $$
  select r.id, r.kind, r.state, r.words, r.created_at, r.updated_at,
    (select count(*)::integer from public.report_messages m where m.report_id = r.id and m.from_owner),
    exists (select 1 from public.report_messages m where m.report_id = r.id and m.from_owner and m.at > r.seen_at)
  from public.reports r
  where r.user_id = (select auth.uid())
  order by r.created_at desc, r.id desc
  limit 200;
$$;

-- You've read it: its replies are no longer new.
create function public.see_report(p_report uuid)
returns void
language sql
security definer set search_path = ''
as $$
  update public.reports set seen_at = now()
  where id = p_report and user_id = (select auth.uid());
$$;

-- Write back on your own report. It goes back to the top of the owner's
-- Inbox as new. Answers the report's id; the API then tells the owner.
create function public.write_back(p_report uuid, p_body text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  body text := btrim(coalesce(p_body, ''));
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if char_length(body) not between 1 and 2000 then
    raise exception 'report_words' using errcode = 'P0001';
  end if;
  perform 1 from public.reports where id = p_report and user_id = me for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  -- Twenty a day, so a stuck button cannot fill the Inbox this way either.
  if (select count(*) from public.report_messages m join public.reports r on r.id = m.report_id
      where r.user_id = me and not m.from_owner and m.at > now() - interval '1 day') >= 20 then
    raise exception 'report_limit' using errcode = 'P0001';
  end if;
  insert into public.report_messages (report_id, from_owner, author, body) values (p_report, false, me, body);
  update public.reports set state = 'new', updated_at = now(), seen_at = now() where id = p_report;
  return p_report;
end;
$$;

-- --- The owner's Inbox ------------------------------------------------------------------

-- Reports that match the search: the words (a name, email or house that has
-- them, what they said, or a report id that starts with them), the state
-- ('waiting' is new or open), the kind, and when they were sent.
create function public.owner_reports_find(
  p_q text default '',
  p_state text default null,
  p_kind text default null,
  p_after timestamptz default null,
  p_before timestamptz default null
)
returns table (
  id uuid,
  user_id uuid,
  name text,
  email text,
  house_name text,
  kind text,
  state text,
  words text,
  created_at timestamptz,
  updated_at timestamptz
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
    select r.id, r.user_id, p.display_name, case when p.deleted_at is null then u.email::text end, h.name,
      r.kind, r.state, r.words, r.created_at, r.updated_at
    from public.reports r
    left join public.profiles p on p.id = r.user_id
    left join auth.users u on u.id = r.user_id
    left join public.houses h on h.id = r.house_id
    where (p_state is null
        or (p_state = 'waiting' and r.state in ('new', 'open'))
        or r.state = p_state)
      and (p_kind is null or r.kind = p_kind)
      and (p_after is null or r.created_at > p_after)
      and (p_before is null or r.created_at <= p_before)
      and (q = ''
        or r.id::text like q || '%'
        or lower(p.display_name) like '%' || q || '%'
        or (p.deleted_at is null and lower(u.email::text) like '%' || q || '%')
        or lower(h.name) like '%' || q || '%'
        or lower(r.words) like '%' || q || '%');
end;
$$;

-- A page of them, newest first, after the last one shown (its created_at and id).
create function public.owner_reports_page(
  p_q text default '',
  p_state text default null,
  p_kind text default null,
  p_after timestamptz default null,
  p_before timestamptz default null,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 51
)
returns table (
  id uuid,
  user_id uuid,
  name text,
  email text,
  house_name text,
  kind text,
  state text,
  words text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  return query
    select f.*
    from public.owner_reports_find(p_q, p_state, p_kind, p_after, p_before) f
    where p_cursor_at is null or (f.created_at, f.id) < (p_cursor_at, p_cursor_id)
    order by f.created_at desc, f.id desc
    limit least(greatest(coalesce(p_limit, 51), 1), 201);
end;
$$;

-- How many match.
create function public.owner_reports_count(
  p_q text default '',
  p_state text default null,
  p_kind text default null,
  p_after timestamptz default null,
  p_before timestamptz default null
)
returns bigint
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  return (select count(*) from public.owner_reports_find(p_q, p_state, p_kind, p_after, p_before));
end;
$$;

-- One report, whole: who sent it and from where, what they said, the
-- details, the screenshots' paths and the conversation. Opening a new one
-- marks it read (open), which its sender sees.
create function public.owner_open_report(p_report uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  r public.reports;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  update public.reports set state = 'open' where id = p_report and state = 'new' returning * into r;
  if r.id is null then
    select * into r from public.reports where id = p_report;
  end if;
  if r.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'id', r.id,
    'user_id', r.user_id,
    'name', (select p.display_name from public.profiles p where p.id = r.user_id),
    'email', (select u.email::text from auth.users u join public.profiles p on p.id = u.id
      where u.id = r.user_id and p.deleted_at is null),
    'house_id', r.house_id,
    'house_name', (select h.name from public.houses h where h.id = r.house_id),
    'role', (select m.role from public.members m where m.user_id = r.user_id and m.house_id = r.house_id),
    'kind', r.kind,
    'state', r.state,
    'words', r.words,
    'details', r.details,
    'shots', to_jsonb(r.shots),
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'from_owner', m.from_owner, 'author_name', m.author_name, 'body', m.body, 'at', m.at) order by m.at, m.id)
      from public.report_messages m where m.report_id = r.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Reply, as the owner. Goes in the audit log. Answers who to tell: the API
-- sends the push and the email.
create function public.owner_reply_report(p_report uuid, p_body text)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  body text := btrim(coalesce(p_body, ''));
  r public.reports;
  signed text;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if char_length(body) not between 1 and 2000 then
    raise exception 'report_words' using errcode = 'P0001';
  end if;
  select * into r from public.reports where id = p_report for update;
  if r.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select split_part(btrim(p.display_name), ' ', 1) into signed from public.profiles p where p.id = me;
  insert into public.report_messages (report_id, from_owner, author, author_name, body)
  values (r.id, true, me, nullif(signed, ''), body);
  update public.reports set state = 'replied', updated_at = now() where id = r.id;
  insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
  values (me, 'report.reply', 'report', r.id::text, jsonb_build_object('state', r.state), jsonb_build_object('state', 'replied', 'reply', body));
  return jsonb_build_object(
    -- Nobody to tell once they've deleted their account.
    'user_id', (select p.id from public.profiles p where p.id = r.user_id and p.deleted_at is null),
    'kind', r.kind,
    'words', r.words,
    'signed', nullif(signed, ''),
    'zone', (select h.timezone from public.houses h where h.id = r.house_id)
  );
end;
$$;

-- Mark it fixed, or open it again. Goes in the audit log.
create function public.owner_set_report_state(p_report uuid, p_state text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  was text;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if p_state is null or p_state not in ('fixed', 'open') then
    raise exception 'report_state' using errcode = 'P0001';
  end if;
  select state into was from public.reports where id = p_report for update;
  if was is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if was = p_state then
    return;
  end if;
  update public.reports set state = p_state, updated_at = now() where id = p_report;
  insert into public.admin_audit (actor, action, target_kind, target_id, before, after)
  values (
    me, case p_state when 'fixed' then 'report.fixed' else 'report.reopen' end, 'report', p_report::text,
    jsonb_build_object('state', was), jsonb_build_object('state', p_state)
  );
end;
$$;

-- --- Deleting an account ---------------------------------------------------------------

-- As before (20261110090000_delete_account.sql), and their reports lose
-- their screenshots: the API deletes the files with the photo.
create or replace function public.finish_account_deletion(p_user uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  m public.members;
  heir uuid;
begin
  select * into m from public.members where user_id = p_user;
  if m.house_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('johns.members:' || m.house_id::text, 0));
    if m.role = 'admin' and not exists (
      select 1 from public.members where house_id = m.house_id and role = 'admin' and user_id <> p_user
    ) then
      select x.user_id into heir from public.members x
      where x.house_id = m.house_id and x.user_id <> p_user
      order by x.joined_at, x.user_id
      limit 1;
      if heir is not null then
        update public.members set role = 'admin' where house_id = m.house_id and user_id = heir;
      end if;
    end if;
    delete from public.members where house_id = m.house_id and user_id = p_user;
  end if;

  update public.houses set pass_buyer = null where pass_buyer = p_user;
  delete from public.push_subscriptions where user_id = p_user;
  delete from public.notification_prefs where user_id = p_user;
  delete from public.swap_offers where (asked_by = p_user or asked_to = p_user) and answer is null;
  -- The Wall said their name when they moved out; it can't look it up now.
  update public.events set data = data || jsonb_build_object('who', 'Someone who left')
  where user_id = p_user and data ? 'who';
  update public.profiles
  set display_name = 'Someone who left', avatar_url = null, deleted_at = coalesce(deleted_at, now())
  where id = p_user;
  update public.reports set shots = '{}' where user_id = p_user and shots <> '{}';
end;
$$;

-- --- Grants ----------------------------------------------------------------------------

revoke execute on function
  public.send_report(text, text, jsonb, text[]),
  public.my_reports(),
  public.see_report(uuid),
  public.write_back(uuid, text),
  public.owner_reports_find(text, text, text, timestamptz, timestamptz),
  public.owner_reports_page(text, text, text, timestamptz, timestamptz, timestamptz, uuid, integer),
  public.owner_reports_count(text, text, text, timestamptz, timestamptz),
  public.owner_open_report(uuid),
  public.owner_reply_report(uuid, text),
  public.owner_set_report_state(uuid, text),
  public.finish_account_deletion(uuid)
from public, anon, authenticated;
grant execute on function
  public.send_report(text, text, jsonb, text[]),
  public.my_reports(),
  public.see_report(uuid),
  public.write_back(uuid, text),
  public.owner_reports_page(text, text, text, timestamptz, timestamptz, timestamptz, uuid, integer),
  public.owner_reports_count(text, text, text, timestamptz, timestamptz),
  public.owner_open_report(uuid),
  public.owner_reply_report(uuid, text),
  public.owner_set_report_state(uuid, text)
to authenticated;
grant execute on function public.finish_account_deletion(uuid) to service_role;
