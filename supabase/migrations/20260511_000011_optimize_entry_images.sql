alter table public.entry_images
  add column if not exists thumbnail_path text,
  add column if not exists thumbnail_url text,
  add column if not exists original_width integer,
  add column if not exists original_height integer,
  add column if not exists thumbnail_width integer,
  add column if not exists thumbnail_height integer,
  add column if not exists original_size_bytes integer,
  add column if not exists thumbnail_size_bytes integer,
  add column if not exists mime_type text;

update public.entry_images
set mime_type = coalesce(mime_type, 'image/webp')
where mime_type is null;

update storage.buckets
set
  file_size_limit = 5242880,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png']
where id = 'entry-images';
