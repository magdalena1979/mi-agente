export const LIST_MEMBER_ROLES = ['owner', 'editor'] as const

export type ListMemberRole = (typeof LIST_MEMBER_ROLES)[number]

export const INVITATION_STATUSES = ['pending', 'accepted'] as const

export type InvitationStatus = (typeof INVITATION_STATUSES)[number]

export type ListMemberRecord = {
  id: string
  listId: string
  userId: string
  email: string | null
  role: ListMemberRole
  createdAt: string
}

export type InvitationRecord = {
  id: string
  listId: string | null
  email: string
  token: string
  status: InvitationStatus
  invitedBy: string | null
  createdAt: string
}

export type ListRecord = {
  id: string
  name: string
  ownerId: string
  createdAt: string
  members: ListMemberRecord[]
  pendingInvitations: InvitationRecord[]
}

export type InvitationLookupRecord = {
  id: string
  listId: string | null
  listName: string | null
  email: string
  token: string
  status: InvitationStatus
  invitedBy: string | null
  createdAt: string
}
