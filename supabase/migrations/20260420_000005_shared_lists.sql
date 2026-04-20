create type public.list_member_role as enum ('owner', 'editor');

create type public.invitation_status as enum ('pending', 'accepted');

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.list_members (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text,
  role public.list_member_role not null default 'editor',
  created_at timestamptz not null default timezone('utc', now()),
  unique (list_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  email text not null,
  token uuid not null unique,
  status public.invitation_status not null default 'pending',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index invitations_pending_email_idx
  on public.invitations (list_id, lower(email))
  where status = 'pending';

create index lists_owner_id_idx
  on public.lists (owner_id);

create index list_members_list_id_idx
  on public.list_members (list_id);

create index invitations_list_id_idx
  on public.invitations (list_id, created_at desc);

create or replace function public.handle_new_list_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.list_members (list_id, user_id, email, role)
  select
    new.id,
    new.owner_id,
    users.email,
    'owner'::public.list_member_role
  from auth.users as users
  where users.id = new.owner_id
  on conflict (list_id, user_id) do nothing;

  return new;
end;
$$;

create trigger create_owner_membership_on_list_insert
after insert on public.lists
for each row
execute procedure public.handle_new_list_membership();

create or replace function public.is_list_member(target_list_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.list_members members
    where members.list_id = target_list_id
      and members.user_id = auth.uid()
  );
$$;

create or replace function public.is_list_owner(target_list_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lists current_list
    where current_list.id = target_list_id
      and current_list.owner_id = auth.uid()
  );
$$;

create or replace function public.has_pending_invitation(target_list_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.invitations invite
    where invite.list_id = target_list_id
      and lower(invite.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and invite.status = 'pending'
  );
$$;

alter table public.lists enable row level security;
alter table public.list_members enable row level security;
alter table public.invitations enable row level security;

create policy "Users can read accessible lists"
on public.lists
for select
using (public.is_list_member(lists.id));

create policy "Users can create own lists"
on public.lists
for insert
with check (owner_id = auth.uid());

create policy "Owners can update lists"
on public.lists
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Owners can delete lists"
on public.lists
for delete
using (owner_id = auth.uid());

create policy "Members can read list members"
on public.list_members
for select
using (public.is_list_member(list_members.list_id));

create policy "Owners can add owner membership"
on public.list_members
for insert
with check (
  user_id = auth.uid()
  and role = 'owner'
  and public.is_list_owner(list_members.list_id)
);

create policy "Invited users can join shared lists"
on public.list_members
for insert
with check (
  user_id = auth.uid()
  and role = 'editor'
  and lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  and public.has_pending_invitation(list_members.list_id)
);

create policy "Owners can remove list members"
on public.list_members
for delete
using (public.is_list_owner(list_members.list_id));

create policy "Owners and invitees can read invitations"
on public.invitations
for select
using (
  public.is_list_owner(invitations.list_id)
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy "Owners can create invitations"
on public.invitations
for insert
with check (
  invited_by = auth.uid()
  and public.is_list_owner(invitations.list_id)
);

create policy "Owners and invitees can update invitations"
on public.invitations
for update
using (
  public.is_list_owner(invitations.list_id)
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
with check (
  public.is_list_owner(invitations.list_id)
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

insert into public.lists (name, owner_id)
select 'Mi lista', distinct_entries.user_id
from (
  select distinct user_id
  from public.entries
) as distinct_entries
where not exists (
  select 1
  from public.lists existing_list
  where existing_list.owner_id = distinct_entries.user_id
);

alter table public.entries
  add column list_id uuid references public.lists (id) on delete cascade;

update public.entries as current_entry
set list_id = matching_list.id
from public.lists as matching_list
where current_entry.list_id is null
  and matching_list.owner_id = current_entry.user_id;

alter table public.entries
  alter column list_id set not null;

create index entries_list_id_created_at_idx
  on public.entries (list_id, created_at desc);

drop policy if exists "Users can read own entries" on public.entries;
drop policy if exists "Users can insert own entries" on public.entries;
drop policy if exists "Users can update own entries" on public.entries;
drop policy if exists "Users can delete own entries" on public.entries;

create policy "Members can read shared entries"
on public.entries
for select
using (
  public.is_list_member(entries.list_id)
);

create policy "Members can create entries in shared lists"
on public.entries
for insert
with check (
  user_id = auth.uid()
  and public.is_list_member(entries.list_id)
);

create policy "Members can update shared entries"
on public.entries
for update
using (
  public.is_list_member(entries.list_id)
)
with check (
  public.is_list_member(entries.list_id)
);

create policy "Members can delete shared entries"
on public.entries
for delete
using (
  public.is_list_member(entries.list_id)
);

drop policy if exists "Users can manage own entry images" on public.entry_images;

create policy "Members can manage shared entry images"
on public.entry_images
for all
using (
  exists (
    select 1
    from public.entries shared_entry
    join public.list_members members
      on members.list_id = shared_entry.list_id
    where shared_entry.id = entry_images.entry_id
      and members.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.entries shared_entry
    join public.list_members members
      on members.list_id = shared_entry.list_id
    where shared_entry.id = entry_images.entry_id
      and members.user_id = auth.uid()
  )
);

drop policy if exists "Users can manage own entry items" on public.entry_items;

create policy "Members can manage shared entry items"
on public.entry_items
for all
using (
  exists (
    select 1
    from public.entries shared_entry
    join public.list_members members
      on members.list_id = shared_entry.list_id
    where shared_entry.id = entry_items.entry_id
      and members.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.entries shared_entry
    join public.list_members members
      on members.list_id = shared_entry.list_id
    where shared_entry.id = entry_items.entry_id
      and members.user_id = auth.uid()
  )
);

drop policy if exists "Users can read own entry images from storage" on storage.objects;
drop policy if exists "Users can upload own entry images to storage" on storage.objects;
drop policy if exists "Users can update own entry images in storage" on storage.objects;
drop policy if exists "Users can delete own entry images from storage" on storage.objects;
drop policy if exists "Authenticated users can read own entry images from storage" on storage.objects;
drop policy if exists "Authenticated users can upload own entry images to storage" on storage.objects;
drop policy if exists "Authenticated users can update own entry images from storage" on storage.objects;
drop policy if exists "Authenticated users can delete own entry images from storage" on storage.objects;

create policy "Members can read shared entry images from storage"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'entry-images'
  and exists (
    select 1
    from public.entries shared_entry
    join public.list_members members
      on members.list_id = shared_entry.list_id
    where shared_entry.id::text = (storage.foldername(name))[2]
      and members.user_id = auth.uid()
  )
);

create policy "Members can upload shared entry images to storage"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'entry-images'
  and exists (
    select 1
    from public.entries shared_entry
    join public.list_members members
      on members.list_id = shared_entry.list_id
    where shared_entry.id::text = (storage.foldername(name))[2]
      and members.user_id = auth.uid()
  )
);

create policy "Members can update shared entry images in storage"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'entry-images'
  and exists (
    select 1
    from public.entries shared_entry
    join public.list_members members
      on members.list_id = shared_entry.list_id
    where shared_entry.id::text = (storage.foldername(name))[2]
      and members.user_id = auth.uid()
  )
)
with check (
  bucket_id = 'entry-images'
  and exists (
    select 1
    from public.entries shared_entry
    join public.list_members members
      on members.list_id = shared_entry.list_id
    where shared_entry.id::text = (storage.foldername(name))[2]
      and members.user_id = auth.uid()
  )
);

create policy "Members can delete shared entry images from storage"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'entry-images'
  and exists (
    select 1
    from public.entries shared_entry
    join public.list_members members
      on members.list_id = shared_entry.list_id
    where shared_entry.id::text = (storage.foldername(name))[2]
      and members.user_id = auth.uid()
  )
);
