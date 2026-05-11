insert into public.user_categories (user_id, category_id)
select distinct entry_categories.user_id, entry_categories.category_id
from public.entry_categories
on conflict (user_id, category_id) do nothing;
