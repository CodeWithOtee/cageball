-- Cage Ball anonymous usage counters.
-- Paste this whole file into Supabase > SQL Editor > Run. Safe to run twice.
-- Stores only: a random device id (made on the player's phone), an event name,
-- an optional level number, an optional small number, and a timestamp.
-- No names, no emails, no IP addresses.

create table if not exists public.events (
  id     bigint generated always as identity primary key,
  device uuid        not null,
  name   text        not null,
  tier   smallint,
  meta   integer,
  at     timestamptz not null default now()
);

-- "First time" events can only be stored once per device.
create unique index if not exists events_once_idx on public.events (device, name)
  where name in ('first_open','tut_start','tut_done','tut_skip','first_match_start',
                 'first_goal','first_match_end','first_win','second_match_start',
                 'first_share','name_set');
create index if not exists events_name_at_idx on public.events (name, at);

-- Nobody can read or write the table directly from the game.
alter table public.events enable row level security;

create or replace function public.track(p_device uuid, p_name text, p_tier int default null, p_meta int default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_name is null or p_name <> all (array[
    'session','first_open','tut_start','tut_done','tut_skip','first_match_start',
    'first_goal','first_match_end','first_win','second_match_start','first_share','name_set',
    'match_start','match_end','share_tap','board_open','online_tap']) then
    return;
  end if;
  insert into public.events (device, name, tier, meta)
  values (p_device, p_name, least(greatest(p_tier, 0), 9)::smallint, least(greatest(p_meta, -1000), 100000))
  on conflict do nothing;
end;
$$;

revoke all on function public.track(uuid, text, int, int) from public;
grant execute on function public.track(uuid, text, int, int) to anon, authenticated;

-- Funnel: how many different phones reached each step (the dashboard is your view).
create or replace view public.funnel as
select name, count(distinct device) as players, count(*) as events
from public.events
group by name
order by players desc;
