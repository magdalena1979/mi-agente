create extension if not exists pgcrypto;

create type public.entry_type as enum (
  'book',
  'event',
  'recipe',
  'movie',
  'series',
  'collection',
  'other'
);

create type public.entry_source_type as enum ('screenshot', 'manual');

create type public.entry_status as enum ('draft', 'reviewed', 'archived');

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.entry_type not null default 'other',
  title text not null default '',
  summary text not null default '',
  source_type public.entry_source_type not null default 'screenshot',
  source_name text,
  status public.entry_status not null default 'draft',
  ai_tags text[] not null default '{}'::text[],
  extracted_text text not null default '',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.entry_images (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  image_path text not null,
  image_url text,
  position integer not null check (position >= 0),
  ocr_text text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  unique (entry_id, position)
);

create table public.entry_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  item_type text not null,
  title text not null default '',
  subtitle text,
  author_or_director text,
  genre text,
  year text,
  duration text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index entries_user_id_created_at_idx
  on public.entries (user_id, created_at desc);

create index entries_type_idx
  on public.entries (type);

create index entry_images_entry_id_position_idx
  on public.entry_images (entry_id, position);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger set_entries_updated_at
before update on public.entries
for each row
execute procedure public.set_updated_at();

alter table public.entries enable row level security;
alter table public.entry_images enable row level security;
alter table public.entry_items enable row level security;

create policy "Users can read own entries"
on public.entries
for select
using (auth.uid() = user_id);

create policy "Users can insert own entries"
on public.entries
for insert
with check (auth.uid() = user_id);

create policy "Users can update own entries"
on public.entries
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own entries"
on public.entries
for delete
using (auth.uid() = user_id);

create policy "Users can manage own entry images"
on public.entry_images
for all
using (
  exists (
    select 1
    from public.entries e
    where e.id = entry_images.entry_id
      and e.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.entries e
    where e.id = entry_images.entry_id
      and e.user_id = auth.uid()
  )
);

create policy "Users can manage own entry items"
on public.entry_items
for all
using (
  exists (
    select 1
    from public.entries e
    where e.id = entry_items.entry_id
      and e.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.entries e
    where e.id = entry_items.entry_id
      and e.user_id = auth.uid()
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'entry-images',
  'entry-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "Users can read own entry images from storage"
on storage.objects
for select
using (
  bucket_id = 'entry-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can upload own entry images to storage"
on storage.objects
for insert
with check (
  bucket_id = 'entry-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update own entry images in storage"
on storage.objects
for update
using (
  bucket_id = 'entry-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'entry-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete own entry images from storage"
on storage.objects
for delete
using (
  bucket_id = 'entry-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
