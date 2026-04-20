alter type public.entry_source_type add value if not exists 'link';

alter table public.entries
  add column if not exists source_url text,
  add column if not exists uploader_name text,
  add column if not exists uploader_email text;

create table if not exists public.entry_user_marks (
  entry_id uuid not null references public.entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  is_checked boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (entry_id, user_id)
);

create table if not exists public.entry_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_label text,
  entry_id uuid references public.entries (id) on delete cascade,
  entry_title text,
  type text not null default 'new_shared_entry',
  created_at timestamptz not null default timezone('utc', now()),
  read_at timestamptz
);

create index if not exists entries_source_url_idx
  on public.entries (source_url);

create index if not exists entry_user_marks_user_id_idx
  on public.entry_user_marks (user_id, updated_at desc);

create index if not exists entry_notifications_recipient_user_id_idx
  on public.entry_notifications (recipient_user_id, created_at desc);

drop trigger if exists set_entry_user_marks_updated_at on public.entry_user_marks;

create trigger set_entry_user_marks_updated_at
before update on public.entry_user_marks
for each row
execute procedure public.set_updated_at();

create or replace function public.notify_shared_users_on_entry_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.entry_notifications (
    recipient_user_id,
    actor_user_id,
    actor_label,
    entry_id,
    entry_title,
    type
  )
  select
    shared.shared_with_user_id,
    new.user_id,
    coalesce(new.uploader_name, new.uploader_email, 'Alguien'),
    new.id,
    new.title,
    'new_shared_entry'
  from public.shared_users shared
  where shared.user_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists notify_shared_users_on_entry_insert on public.entries;

create trigger notify_shared_users_on_entry_insert
after insert on public.entries
for each row
execute procedure public.notify_shared_users_on_entry_insert();

alter table public.entry_user_marks enable row level security;
alter table public.entry_notifications enable row level security;

create policy "Users can read own entry marks"
on public.entry_user_marks
for select
using (auth.uid() = user_id);

create policy "Users can upsert own entry marks"
on public.entry_user_marks
for insert
with check (auth.uid() = user_id);

create policy "Users can update own entry marks"
on public.entry_user_marks
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read own entry notifications"
on public.entry_notifications
for select
using (auth.uid() = recipient_user_id);

create policy "Users can update own entry notifications"
on public.entry_notifications
for update
using (auth.uid() = recipient_user_id)
with check (auth.uid() = recipient_user_id);
