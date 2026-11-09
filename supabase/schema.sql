create table if not exists public.game_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  game_state jsonb not null check (jsonb_typeof(game_state) = 'object'),
  updated_at timestamptz not null default now()
);

create table if not exists public.drafts (
  user_id uuid not null references auth.users (id) on delete cascade,
  draft_id uuid not null,
  formation text not null check (formation in ('4-3-3', '4-2-3-1')),
  selected_players jsonb not null check (
    case
      when jsonb_typeof(selected_players) = 'array' then jsonb_array_length(selected_players) = 11
      else false
    end
  ),
  created_at timestamptz not null default now(),
  primary key (user_id, draft_id)
);

create table if not exists public.cup_runs (
  user_id uuid not null references auth.users (id) on delete cascade,
  tournament_id uuid not null,
  draft_id uuid not null,
  outcome text not null check (outcome in ('champion', 'eliminated')),
  rounds_won smallint not null check (rounds_won between 0 and 5),
  completed_at timestamptz not null default now(),
  primary key (user_id, tournament_id),
  foreign key (user_id, draft_id)
    references public.drafts (user_id, draft_id)
    on delete cascade
);

create index if not exists drafts_user_created_at_idx
  on public.drafts (user_id, created_at desc);
create index if not exists cup_runs_user_completed_at_idx
  on public.cup_runs (user_id, completed_at desc);

alter table public.game_saves enable row level security;
alter table public.drafts enable row level security;
alter table public.cup_runs enable row level security;

drop policy if exists "Players manage their own save" on public.game_saves;
create policy "Players manage their own save"
  on public.game_saves for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Players manage their own drafts" on public.drafts;
create policy "Players manage their own drafts"
  on public.drafts for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Players manage their own cup history" on public.cup_runs;
create policy "Players manage their own cup history"
  on public.cup_runs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.game_saves, public.drafts, public.cup_runs from public, anon, authenticated;
grant select, insert, update, delete on public.game_saves, public.drafts, public.cup_runs to authenticated;

create or replace function public.delete_my_game_data()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.game_saves where user_id = (select auth.uid());
  delete from public.cup_runs where user_id = (select auth.uid());
  delete from public.drafts where user_id = (select auth.uid());
end;
$$;

revoke all on function public.delete_my_game_data() from public, anon;
grant execute on function public.delete_my_game_data() to authenticated;
