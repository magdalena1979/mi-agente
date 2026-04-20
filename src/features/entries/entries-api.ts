import { supabase } from '@/integrations/supabase/client'
import {
  ENTRY_FIELD_KEYS,
  type EntryMetadataFields,
  type EntryRecord,
  type EntrySourceType,
  type EntryStatus,
  type EntryType,
} from '@/types/entries'

type EntryRow = {
  id: string
  user_id: string
  list_id?: string | null
  type: EntryType
  title: string
  summary: string
  source_type: EntrySourceType
  source_name: string | null
  source_url?: string | null
  status: EntryStatus
  ai_tags: string[] | null
  extracted_text: string
  metadata_json: unknown
  uploader_name?: string | null
  uploader_email?: string | null
  created_at: string
  updated_at: string
}

export type EntryMutationInput = {
  userId: string
  type: EntryType
  title: string
  summary: string
  sourceType: EntrySourceType
  sourceName: string | null
  sourceUrl: string | null
  status: EntryStatus
  aiTags: string[]
  extractedText: string
  metadata: EntryMetadataFields
  uploaderName?: string | null
  uploaderEmail?: string | null
}

function getClient() {
  if (!supabase) {
    throw new Error(
      'Supabase no esta configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
    )
  }

  return supabase
}

function coerceEntryMetadata(value: unknown): EntryMetadataFields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const record = value as Record<string, unknown>

  return ENTRY_FIELD_KEYS.reduce<EntryMetadataFields>((metadata, key) => {
    const nextValue = record[key]

    if (typeof nextValue === 'string') {
      metadata[key] = nextValue
    }

    return metadata
  }, {})
}

function mapEntryRow(row: EntryRow): EntryRecord {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    summary: row.summary,
    sourceType: row.source_type,
    sourceName: row.source_name,
    sourceUrl: row.source_url ?? null,
    status: row.status,
    aiTags: row.ai_tags ?? [],
    extractedText: row.extracted_text,
    metadata: coerceEntryMetadata(row.metadata_json),
    uploaderName: row.uploader_name ?? null,
    uploaderEmail: row.uploader_email ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapEntryMutationInput(input: EntryMutationInput) {
  return {
    user_id: input.userId,
    type: input.type,
    title: input.title,
    summary: input.summary,
    source_type: input.sourceType,
    source_name: input.sourceName,
    source_url: input.sourceUrl,
    status: input.status,
    ai_tags: input.aiTags,
    extracted_text: input.extractedText,
    metadata_json: input.metadata,
    uploader_name: input.uploaderName ?? null,
    uploader_email: input.uploaderEmail ?? null,
  }
}

export async function listEntries() {
  const client = getClient()

  const { data, error } = await client
    .from('entries')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as EntryRow[]).map(mapEntryRow)
}

export async function getEntry(entryId: string) {
  const client = getClient()

  const { data, error } = await client
    .from('entries')
    .select('*')
    .eq('id', entryId)
    .maybeSingle()

  if (error) throw error

  if (!data) return null

  return mapEntryRow(data as EntryRow)
}

export async function listEntriesForList(listId: string) {
  const client = getClient()

  const { data, error } = await client
    .from('entries')
    .select('*')
    .eq('list_id', listId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as EntryRow[]).map(mapEntryRow)
}

export async function createEntry(input: EntryMutationInput) {
  const client = getClient()

  const { data, error } = await client
    .from('entries')
    .insert(mapEntryMutationInput(input))
    .select('*')
    .single()

  if (error) throw error

  return mapEntryRow(data as EntryRow)
}

export async function updateEntry(entryId: string, input: EntryMutationInput) {
  const client = getClient()

  const { data, error } = await client
    .from('entries')
    .update(mapEntryMutationInput(input))
    .eq('id', entryId)
    .select('*')
    .single()

  if (error) throw error

  return mapEntryRow(data as EntryRow)
}

export async function deleteEntry(entryId: string) {
  const client = getClient()

  const { error } = await client
    .from('entries')
    .delete()
    .eq('id', entryId)

  if (error) throw error
}
