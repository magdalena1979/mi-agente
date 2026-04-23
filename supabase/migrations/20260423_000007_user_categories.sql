create table if not exists public.user_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  normalized_name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, normalized_name)
);

create table if not exists public.entry_user_categories (
  entry_id uuid not null references public.entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  user_category_id uuid not null references public.user_categories (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (entry_id, user_id, user_category_id)
);

create index if not exists user_categories_user_id_idx
  on public.user_categories (user_id, created_at desc);

create index if not exists entry_user_categories_user_id_idx
  on public.entry_user_categories (user_id, entry_id);

alter table public.user_categories enable row level security;
alter table public.entry_user_categories enable row level security;

create policy "Users can read own categories"
on public.user_categories
for select
using (auth.uid() = user_id);

create policy "Users can insert own categories"
on public.user_categories
for insert
with check (auth.uid() = user_id);

create policy "Users can update own categories"
on public.user_categories
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own categories"
on public.user_categories
for delete
using (auth.uid() = user_id);

create policy "Users can read own entry category assignments"
on public.entry_user_categories
for select
using (auth.uid() = user_id);

create policy "Users can insert own entry category assignments"
on public.entry_user_categories
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.user_categories
    where user_categories.id = user_category_id
      and user_categories.user_id = auth.uid()
  )
);

create policy "Users can delete own entry category assignments"
on public.entry_user_categories
for delete
using (auth.uid() = user_id);
