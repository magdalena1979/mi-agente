do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'categories'
      and policyname = 'Users can insert categories'
  ) then
    create policy "Users can insert categories"
    on public.categories
    for insert
    to authenticated
    with check (true);
  end if;
end $$;

drop policy if exists "Users can insert own entry category assignments"
on public.entry_categories;

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

drop policy if exists "Users can update own entry category assignments"
on public.entry_categories;

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
