update storage.buckets
set
  file_size_limit = 20971520,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'application/pdf']
where id = 'entry-images';
