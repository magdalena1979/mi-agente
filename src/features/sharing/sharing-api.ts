import { supabase } from '@/integrations/supabase/client'
import type {
  EntryNotificationRecord,
  EntryUserMarkRecord,
} from '@/types/entries'
import type { InvitationRecord } from '@/types/lists'

type EntryUserMarkRow = {
  entry_id: string
  user_id: string
  is_checked: boolean
  updated_at: string
}

type EntryNotificationRow = {
  id: string
  recipient_user_id: string
  actor_user_id: string | null
  actor_label: string | null
  entry_id: string | null
  entry_title: string | null
  type: 'new_shared_entry'
  created_at: string
  read_at: string | null
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

function getClient() {
  if (!supabase) {
    throw new Error(
      'Supabase no esta configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
    )
  }

  return supabase
}

function isMissingRelationError(error: unknown, relationName: string) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code =
    'code' in error && typeof error.code === 'string' ? error.code : null
  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message
      : ''

  return code === '42P01' || message.toLowerCase().includes(relationName)
}

function mapEntryUserMarkRow(row: EntryUserMarkRow): EntryUserMarkRecord {
  return {
    entryId: row.entry_id,
    userId: row.user_id,
    isChecked: row.is_checked,
    updatedAt: row.updated_at,
  }
}

function mapEntryNotificationRow(
  row: EntryNotificationRow,
): EntryNotificationRecord {
  return {
    id: row.id,
    recipientUserId: row.recipient_user_id,
    actorUserId: row.actor_user_id,
    actorLabel: row.actor_label,
    entryId: row.entry_id,
    entryTitle: row.entry_title,
    type: row.type,
    createdAt: row.created_at,
    readAt: row.read_at,
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

export async function listEntryUserMarks(userId: string, entryIds: string[]) {
  if (entryIds.length === 0) {
    return []
  }

  const client = getClient()

  const { data, error } = await client
    .from('entry_user_marks')
    .select('*')
    .eq('user_id', userId)
    .in('entry_id', entryIds)

  if (error) {
    if (isMissingRelationError(error, 'entry_user_marks')) {
      return []
    }

    throw error
  }

  return ((data ?? []) as EntryUserMarkRow[]).map(mapEntryUserMarkRow)
}

export async function upsertEntryUserMark(input: {
  entryId: string
  userId: string
  isChecked: boolean
}) {
  const client = getClient()

  const { data, error } = await client
    .from('entry_user_marks')
    .upsert(
      {
        entry_id: input.entryId,
        user_id: input.userId,
        is_checked: input.isChecked,
      },
      {
        onConflict: 'entry_id,user_id',
      },
    )
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapEntryUserMarkRow(data as EntryUserMarkRow)
}

export async function listUnreadEntryNotifications(userId: string) {
  const client = getClient()

  const { data, error } = await client
    .from('entry_notifications')
    .select('*')
    .eq('recipient_user_id', userId)
    .is('read_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingRelationError(error, 'entry_notifications')) {
      return []
    }

    throw error
  }

  return ((data ?? []) as EntryNotificationRow[]).map(mapEntryNotificationRow)
}

export async function listSentEntriesShareInvitations(userId: string) {
  const client = getClient()

  const { data, error } = await client
    .from('invitations')
    .select('id,list_id,email,token,status,invited_by,created_at')
    .is('list_id', null)
    .eq('invited_by', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return ((data ?? []) as InvitationRow[]).map(mapInvitationRow)
}

export async function revokeEntriesShare(invitationId: string) {
  const client = getClient()

  const { data, error } = await client.functions.invoke('revoke-share', {
    body: {
      invitationId,
    },
  })

  if (error) {
    throw error
  }

  return data
}

export async function markEntryNotificationAsRead(notificationId: string) {
  const client = getClient()

  const { error } = await client
    .from('entry_notifications')
    .update({
      read_at: new Date().toISOString(),
    })
    .eq('id', notificationId)

  if (error) {
    throw error
  }
}
