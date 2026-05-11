-- Refactor categories to be global with many-to-many relationship to users

-- Rename old tables to avoid conflicts
alter table if exists public.user_categories rename to old_user_categories;
alter table if exists public.entry_user_categories rename to old_entry_user_categories;

-- Create new categories table
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

-- Create user_categories junction table
create table public.user_categories (
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, category_id)
);

-- Create new entry_categories table
create table public.entry_categories (
  entry_id uuid not null references public.entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (entry_id, user_id, category_id)
);

-- Migrate existing data if old tables exist
-- Insert unique categories from old user_categories
insert into public.categories (name, normalized_name, created_at)
select distinct name, normalized_name, min(created_at)
from public.old_user_categories
group by name, normalized_name;

-- Insert user-category assignments
insert into public.user_categories (user_id, category_id)
select ouc.user_id, c.id
from public.old_user_categories ouc
join public.categories c on ouc.normalized_name = c.normalized_name;

-- Migrate entry_user_categories to entry_categories
insert into public.entry_categories (entry_id, user_id, category_id, created_at)
select oeuc.entry_id, oeuc.user_id, c.id, oeuc.created_at
from public.old_entry_user_categories oeuc
join public.old_user_categories ouc on oeuc.user_category_id = ouc.id
join public.categories c on ouc.normalized_name = c.normalized_name;

-- Drop old tables (drop child first due to foreign keys)
drop table if exists public.old_entry_user_categories cascade;
drop table if exists public.old_user_categories cascade;

-- Rename new tables to old names for compatibility (optional, but to keep API consistent)
-- Actually, since we changed the API, we can keep the names.

-- Add indexes
create index if not exists categories_normalized_name_idx on public.categories (normalized_name);
create index if not exists user_categories_user_id_idx on public.user_categories (user_id);
create index if not exists entry_categories_user_id_idx on public.entry_categories (user_id, entry_id);

-- Enable RLS
alter table public.categories enable row level security;
alter table public.user_categories enable row level security;
alter table public.entry_categories enable row level security;

-- Policies for categories (global, readable by all)
create policy "Users can read categories"
on public.categories
for select
using (true);

create policy "Users can insert categories"
on public.categories
for insert
to authenticated
with check (true);

-- Policies for user_categories
create policy "Users can read own category assignments"
on public.user_categories
for select
using (auth.uid() = user_id);

create policy "Users can insert own category assignments"
on public.user_categories
for insert
with check (auth.uid() = user_id);

create policy "Users can delete own category assignments"
on public.user_categories
for delete
using (auth.uid() = user_id);

-- Policies for entry_categories
create policy "Users can read own entry category assignments"
on public.entry_categories
for select
using (auth.uid() = user_id);

create policy "Users can insert own entry category assignments"
on public.entry_categories
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.user_categories
    where user_categories.user_id = auth.uid()
      and user_categories.category_id = entry_categories.category_id
  )
);

create policy "Users can update own entry category assignments"
on public.entry_categories
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.user_categories
    where user_categories.user_id = auth.uid()
      and user_categories.category_id = entry_categories.category_id
  )
);

create policy "Users can delete own entry category assignments"
on public.entry_categories
for delete
using (auth.uid() = user_id);
