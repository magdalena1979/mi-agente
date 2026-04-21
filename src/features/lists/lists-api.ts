import { supabase } from '@/integrations/supabase/client'
import type {
  InvitationLookupRecord,
  InvitationRecord,
  ListMemberRecord,
  ListRecord,
} from '@/types/lists'

type ListRow = {
  id: string
  name: string
  owner_id: string
  created_at: string
  list_members?: ListMemberRow[] | null
  invitations?: InvitationRow[] | null
}

type SimpleListRow = {
  id: string
  name: string
  owner_id: string
  created_at: string
}

type ListMemberRow = {
  id: string
  list_id: string
  user_id: string
  email: string | null
  role: 'owner' | 'editor'
  created_at: string
}

type InvitationRow = {
  id: string
  list_id: string | null
  email: string
  token: string
  status: 'pending' | 'accepted'
  invited_by: string | null
  created_at: string
}

type InvitationLookupRow = InvitationRow & {
  lists?:
    | {
        name: string
      }
    | Array<{
        name: string
      }>
    | null
}

const DEFAULT_LIST_NAME = 'Mi lista'
const LIST_SELECT = `
  id,
  name,
  owner_id,
  created_at,
  list_members(id,list_id,user_id,email,role,created_at),
  invitations(id,list_id,email,token,status,invited_by,created_at)
`

function getClient() {
  if (!supabase) {
    throw new Error(
      'Supabase no esta configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
    )
  }

  return supabase
}

function mapListMemberRow(row: ListMemberRow): ListMemberRecord {
  return {
    id: row.id,
    listId: row.list_id,
    userId: row.user_id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  }
}

function mapInvitationRow(row: InvitationRow): InvitationRecord {
  return {
    id: row.id,
    listId: row.list_id,
    email: row.email,
    token: row.token,
    status: row.status,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
  }
}

function mapInvitationLookupRow(row: InvitationLookupRow): InvitationLookupRecord {
  const relatedList = Array.isArray(row.lists) ? row.lists[0] : row.lists

  return {
    id: row.id,
    listId: row.list_id,
    listName: relatedList?.name ?? null,
    email: row.email,
    token: row.token,
    status: row.status,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
  }
}

function mapListRow(row: ListRow): ListRecord {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    members: (row.list_members ?? []).map(mapListMemberRow),
    pendingInvitations: (row.invitations ?? [])
      .filter((invitation) => invitation.status === 'pending')
      .map(mapInvitationRow),
  }
}

export async function ensureDefaultList(userId: string) {
  const client = getClient()

  const { data: existingLists, error: selectError } = await client
    .from('lists')
    .select('id,name,owner_id,created_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })

  if (selectError) {
    throw selectError
  }

  const firstOwnedList = (existingLists ?? [])[0] as SimpleListRow | undefined

  if (firstOwnedList) {
    return {
      id: firstOwnedList.id,
      name: firstOwnedList.name,
      ownerId: firstOwnedList.owner_id,
      createdAt: firstOwnedList.created_at,
      members: [],
      pendingInvitations: [],
    }
  }

  const newListId = crypto.randomUUID()

  const { error } = await client
    .from('lists')
    .insert({
      id: newListId,
      name: DEFAULT_LIST_NAME,
      owner_id: userId,
    })

  if (error) {
    throw error
  }

  return {
    id: newListId,
    name: DEFAULT_LIST_NAME,
    ownerId: userId,
    createdAt: new Date().toISOString(),
    members: [],
    pendingInvitations: [],
  }
}

export async function listAccessibleLists() {
  const client = getClient()

  const { data, error } = await client
    .from('lists')
    .select(LIST_SELECT)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return ((data ?? []) as ListRow[]).map(mapListRow)
}

export async function getList(listId: string) {
  const client = getClient()

  const { data, error } = await client
    .from('lists')
    .select(LIST_SELECT)
    .eq('id', listId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  return mapListRow(data as ListRow)
}
export async function createInvitation(input: {
  listId: string
  email: string
  token: string
  invitedBy: string
}) {
  const client = getClient()
  const normalizedEmail = input.email.trim().toLowerCase()

  const { data: existingMember, error: memberError } = await client
    .from('list_members')
    .select('id')
    .eq('list_id', input.listId)
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (memberError) {
    throw memberError
  }

  if (existingMember) {
    throw new Error('Esa persona ya forma parte de la lista.')
  }

  const { data: existingInvitation, error: existingInvitationError } = await client
    .from('invitations')
    .select('*')
    .eq('list_id', input.listId)
    .eq('email', normalizedEmail)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingInvitationError) {
    throw existingInvitationError
  }

  if (existingInvitation) {
    throw new Error('Ya existe una invitacion pendiente para ese email.')
  }

  const { data, error } = await client
    .from('invitations')
    .insert({
      list_id: input.listId,
      email: normalizedEmail,
      token: input.token,
      status: 'pending',
      invited_by: input.invitedBy,
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapInvitationRow(data as InvitationRow)
}

export async function createEntriesShareInvitation(input: {
  email: string
  token: string
  invitedBy: string
}) {
  const client = getClient()
  const normalizedEmail = input.email.trim().toLowerCase()

  const { data: existingInvitation, error: existingInvitationError } = await client
    .from('invitations')
    .select('*')
    .is('list_id', null)
    .eq('email', normalizedEmail)
    .eq('invited_by', input.invitedBy)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingInvitationError) {
    throw existingInvitationError
  }

  if (existingInvitation) {
    throw new Error('Ya existe una invitacion pendiente para ese email.')
  }

  const { data, error } = await client
    .from('invitations')
    .insert({
      list_id: null,
      email: normalizedEmail,
      token: input.token,
      status: 'pending',
      invited_by: input.invitedBy,
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapInvitationRow(data as InvitationRow)
}

export async function deleteInvitation(invitationId: string) {
  const client = getClient()

  const { error } = await client
    .from('invitations')
    .delete()
    .eq('id', invitationId)

  if (error) {
    throw error
  }
}

export async function sendShareInvitationEmail(input: {
  email: string
  token: string
  listName?: string | null
  recipientName?: string
  shareScope?: 'entries' | 'list'
  inviteLink?: string
}) {
  const client = getClient()

  const { error } = await client.functions.invoke('invite-user', {
    body: {
      email: input.email,
      redirectTo:
        input.inviteLink ??
        `${window.location.origin}/accept-invite?token=${input.token}`,
    },
  })

  if (error) {
    throw error
  }
}

export async function getInvitationByToken(token: string) {
  const client = getClient()

  const { data, error } = await client
    .from('invitations')
    .select('id,list_id,email,token,status,invited_by,created_at,lists(name)')
    .eq('token', token)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  return mapInvitationLookupRow(data as unknown as InvitationLookupRow)
}

export async function listPendingInvitations(userEmail: string) {
  const client = getClient()
  const normalizedEmail = userEmail.trim().toLowerCase()

  const { data, error } = await client
    .from('invitations')
    .select('id,list_id,email,token,status,invited_by,created_at,lists(name)')
    .eq('email', normalizedEmail)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return ((data ?? []) as unknown as InvitationLookupRow[]).map(
    mapInvitationLookupRow,
  )
}

export async function acceptInvitation(input: {
  invitation: InvitationLookupRecord
  userId: string
  userEmail: string
}) {
  const client = getClient()
  const normalizedEmail = input.userEmail.trim().toLowerCase()

  if (input.invitation.listId) {
    const { data: existingMember, error: memberError } = await client
      .from('list_members')
      .select('id')
      .eq('list_id', input.invitation.listId)
      .eq('user_id', input.userId)
      .maybeSingle()

    if (memberError) {
      throw memberError
    }

    if (!existingMember) {
      const { error: insertError } = await client
        .from('list_members')
        .insert({
          list_id: input.invitation.listId,
          user_id: input.userId,
          email: normalizedEmail,
          role: 'editor',
        })

      if (insertError) {
        throw insertError
      }
    }
  } else {
    if (!input.invitation.invitedBy) {
      throw new Error('La invitacion no tiene un remitente valido.')
    }

    const { data: existingShare, error: existingShareError } = await client
      .from('shared_users')
      .select('user_id')
      .eq('user_id', input.invitation.invitedBy)
      .eq('shared_with_user_id', input.userId)
      .maybeSingle()

    if (existingShareError) {
      throw existingShareError
    }

    if (!existingShare) {
      const { error: insertShareError } = await client
        .from('shared_users')
        .insert({
          user_id: input.invitation.invitedBy,
          shared_with_user_id: input.userId,
        })

      if (insertShareError) {
        throw insertShareError
      }
    }
  }

  const { error: updateError } = await client
    .from('invitations')
    .update({
      status: 'accepted',
    })
    .eq('id', input.invitation.id)

  if (updateError) {
    throw updateError
  }
}
