import { supabase } from '@/integrations/supabase/client'
import type {
  EntryUserCategoryRecord,
  UserCategoryRecord,
} from '@/types/categories'

type UserCategoryRow = {
  id: string
  user_id: string
  name: string
  normalized_name: string
  created_at: string
}

type EntryUserCategoryRow = {
  entry_id: string
  user_id: string
  user_category_id: string
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

function normalizeCategoryName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

function normalizeCategoryKey(name: string) {
  return normalizeCategoryName(name).toLowerCase()
}

function mapUserCategoryRow(row: UserCategoryRow): UserCategoryRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    normalizedName: row.normalized_name,
    createdAt: row.created_at,
  }
}

function mapEntryUserCategoryRow(
  row: EntryUserCategoryRow,
): EntryUserCategoryRecord {
  return {
    entryId: row.entry_id,
    userId: row.user_id,
    userCategoryId: row.user_category_id,
    createdAt: row.created_at,
  }
}

export async function listUserCategories(userId: string) {
  const client = getClient()

  const { data, error } = await client
    .from('user_categories')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true })

  if (error) {
    throw error
  }

  return ((data ?? []) as UserCategoryRow[]).map(mapUserCategoryRow)
}

export async function createUserCategory(input: {
  userId: string
  name: string
}) {
  const client = getClient()
  const name = normalizeCategoryName(input.name)

  if (!name) {
    throw new Error('Ingresa un nombre para la subcategoria.')
  }

  const { data, error } = await client
    .from('user_categories')
    .insert({
      user_id: input.userId,
      name,
      normalized_name: normalizeCategoryKey(name),
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapUserCategoryRow(data as UserCategoryRow)
}

export async function createManyUserCategories(input: {
  userId: string
  names: string[]
}) {
  const client = getClient()
  const rows = Array.from(
    new Map(
      input.names
        .map((name) => normalizeCategoryName(name))
        .filter(Boolean)
        .map((name) => [normalizeCategoryKey(name), name]),
    ).values(),
  ).map((name) => ({
    user_id: input.userId,
    name,
    normalized_name: normalizeCategoryKey(name),
  }))

  if (rows.length === 0) {
    return []
  }

  const { data, error } = await client
    .from('user_categories')
    .upsert(rows, {
      onConflict: 'user_id,normalized_name',
      ignoreDuplicates: true,
    })
    .select('*')

  if (error) {
    throw error
  }

  return ((data ?? []) as UserCategoryRow[]).map(mapUserCategoryRow)
}

export async function deleteUserCategory(input: {
  userId: string
  categoryId: string
}) {
  const client = getClient()

  const { error } = await client
    .from('user_categories')
    .delete()
    .eq('id', input.categoryId)
    .eq('user_id', input.userId)

  if (error) {
    throw error
  }
}

export async function listEntryUserCategories(userId: string, entryIds: string[]) {
  if (entryIds.length === 0) {
    return []
  }

  const client = getClient()

  const { data, error } = await client
    .from('entry_user_categories')
    .select('*')
    .eq('user_id', userId)
    .in('entry_id', entryIds)

  if (error) {
    throw error
  }

  return ((data ?? []) as EntryUserCategoryRow[]).map(mapEntryUserCategoryRow)
}

export async function replaceEntryUserCategories(input: {
  entryId: string
  userId: string
  categoryIds: string[]
}) {
  const client = getClient()

  const { error: deleteError } = await client
    .from('entry_user_categories')
    .delete()
    .eq('entry_id', input.entryId)
    .eq('user_id', input.userId)

  if (deleteError) {
    throw deleteError
  }

  if (input.categoryIds.length === 0) {
    return []
  }

  const { data, error } = await client
    .from('entry_user_categories')
    .insert(
      input.categoryIds.map((categoryId) => ({
        entry_id: input.entryId,
        user_id: input.userId,
        user_category_id: categoryId,
      })),
    )
    .select('*')

  if (error) {
    throw error
  }

  return ((data ?? []) as EntryUserCategoryRow[]).map(mapEntryUserCategoryRow)
}
