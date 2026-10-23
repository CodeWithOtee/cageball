-- Adds the four online counters. Paste into Supabase > SQL Editor > Run.
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
    'match_start','match_end','share_tap','board_open','online_tap',
    'online_host','online_join','online_match','online_end']) then
    return;
  end if;
  insert into public.events (device, name, tier, meta)
  values (p_device, p_name, least(greatest(p_tier, 0), 9)::smallint, least(greatest(p_meta, -1000), 100000))
  on conflict do nothing;
end;
$$;
