-- ============================================================
-- Routine App — Supabase schema
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query)
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------
-- PROFILES  (one row per auth user)
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_emoji text default '🐯',
  timezone text default 'UTC',          -- e.g. 'Africa/Lagos'
  reminders_enabled boolean default true,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);
create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- auto-create a profile row whenever a new auth user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------
-- TASKS  (a habit / goal definition)
-- type: 'simple'      -> plain daily checkbox habit
--       'alternating' -> rotates through a queue of items, one "active" at a time
--                         (e.g. books: finish one, move to the next)
-- ---------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  icon text default '✅',
  color text default '#F7C9A0',
  type text not null default 'simple' check (type in ('simple','alternating')),
  duration_minutes int default 5,
  reminder_time time,                      -- local time (per profile.timezone) task is "due" by
  is_active boolean default true,
  current_streak int default 0,
  longest_streak int default 0,
  last_completed_date date,
  last_reminder_sent_date date,            -- guards against duplicate reminder emails
  created_at timestamptz default now()
);

alter table public.tasks enable row level security;

create policy "Users manage their own tasks"
  on public.tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- TASK ITEMS  (the rotation queue for 'alternating' tasks)
-- status: 'pending' | 'active' | 'done'
-- exactly one item per task should be 'active' at a time
-- ---------------------------------------------------------------
create table if not exists public.task_items (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  position int not null default 0,
  status text not null default 'pending' check (status in ('pending','active','done')),
  created_at timestamptz default now()
);

alter table public.task_items enable row level security;

create policy "Users manage their own task items"
  on public.task_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- TASK COMPLETIONS  (log of each day a task was marked done)
-- ---------------------------------------------------------------
create table if not exists public.task_completions (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_label text,                 -- snapshot of which item was active (for alternating tasks)
  log_date date not null default current_date,
  completed_at timestamptz default now(),
  unique (task_id, log_date)
);

alter table public.task_completions enable row level security;

create policy "Users manage their own completions"
  on public.task_completions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- Helpful indexes
-- ---------------------------------------------------------------
create index if not exists idx_tasks_user on public.tasks(user_id);
create index if not exists idx_task_items_task on public.task_items(task_id);
create index if not exists idx_completions_user_date on public.task_completions(user_id, log_date);

-- ---------------------------------------------------------------
-- Note on email reminders:
-- Reminders are NOT sent from the database. A Vercel Cron job calls
-- /api/send-reminders every ~15 minutes. That endpoint uses the
-- Supabase service_role key to find tasks whose reminder_time has
-- passed for "today" (in the user's timezone) with no matching
-- task_completions row, sends an email via Resend, then stamps
-- last_reminder_sent_date so it isn't sent twice the same day.
-- ---------------------------------------------------------------
