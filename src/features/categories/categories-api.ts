import { supabase } from '@/integrations/supabase/client'
import type { CategoryRecord, EntryCategoryRecord } from '@/types/categories'

type CategoryRow = {
  id: string
  name: string
  normalized_name: string
  created_at: string
}

type UserCategoryRow = CategoryRow & {
  user_id: string
}

type EntryCategoryRow = {
  entry_id: string
  user_id: string
  category_id: string
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

function getErrorField(error: unknown, field: 'code' | 'message') {
  return typeof error === 'object' && error !== null
    ? (error as Record<string, unknown>)[field]
    : null
}

function isNewCategorySchemaError(error: unknown) {
  const code = getErrorField(error, 'code')
  const message = String(getErrorField(error, 'message') ?? '').toLowerCase()

  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST200' ||
    message.includes('could not find a relationship') ||
    message.includes('relation "public.categories" does not exist') ||
    message.includes('relation "public.entry_categories" does not exist') ||
    message.includes('column user_categories.category_id does not exist')
  )
}

function mapCategoryRow(row: CategoryRow): CategoryRecord {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    createdAt: row.created_at,
  }
}

function mapEntryCategoryRow(row: EntryCategoryRow): EntryCategoryRecord {
  return {
    entryId: row.entry_id,
    userId: row.user_id,
    categoryId: row.category_id,
    createdAt: row.created_at,
  }
}

function mapEntryUserCategoryRow(row: EntryUserCategoryRow): EntryCategoryRecord {
  return {
    entryId: row.entry_id,
    userId: row.user_id,
    categoryId: row.user_category_id,
    createdAt: row.created_at,
  }
}

function uniqueSortedCategories(categories: CategoryRecord[]) {
  return [...new Map(categories.map((category) => [category.id, category])).values()]
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function fetchCategoriesByKeys(keys: string[]) {
  if (keys.length === 0) {
    return []
  }

  const client = getClient()
  const { data, error } = await client
    .from('categories')
    .select('*')
    .in('normalized_name', keys)

  if (error) {
    throw error
  }

  return ((data ?? []) as CategoryRow[]).map(mapCategoryRow)
}

async function createGlobalCategory(name: string) {
  const client = getClient()
  const normalizedName = normalizeCategoryKey(name)
  const { data: existing, error: findError } = await client
    .from('categories')
    .select('*')
    .eq('normalized_name', normalizedName)
    .maybeSingle()

  if (findError) {
    throw findError
  }

  if (existing) {
    return mapCategoryRow(existing as CategoryRow)
  }

  const { data: created, error: insertError } = await client
    .from('categories')
    .insert({
      name,
      normalized_name: normalizedName,
    })
    .select('*')
    .single()

  if (!insertError) {
    return mapCategoryRow(created as CategoryRow)
  }

  if (getErrorField(insertError, 'code') !== '23505') {
    throw insertError
  }

  const [category] = await fetchCategoriesByKeys([normalizedName])

  if (!category) {
    throw insertError
  }

  return category
}

async function listUserCategoriesFromLegacySchema(userId: string) {
  const client = getClient()
  const { data, error } = await client
    .from('user_categories')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true })

  if (error) {
    throw error
  }

  return ((data ?? []) as UserCategoryRow[]).map(mapCategoryRow)
}

async function createUserCategoryInLegacySchema(input: {
  userId: string
  name: string
}) {
  const client = getClient()
  const name = normalizeCategoryName(input.name)

  const { data, error } = await client
    .from('user_categories')
    .upsert(
      {
        user_id: input.userId,
        name,
        normalized_name: normalizeCategoryKey(name),
      },
      {
        onConflict: 'user_id,normalized_name',
        ignoreDuplicates: true,
      },
    )
    .select('*')
    .single()

  if (error) {
    if (getErrorField(error, 'code') !== 'PGRST116') {
      throw error
    }

    const { data: existing, error: findError } = await client
      .from('user_categories')
      .select('*')
      .eq('user_id', input.userId)
      .eq('normalized_name', normalizeCategoryKey(name))
      .single()

    if (findError) {
      throw findError
    }

    return mapCategoryRow(existing as UserCategoryRow)
  }

  return mapCategoryRow(data as UserCategoryRow)
}

export async function listUserCategories(userId: string) {
  const client = getClient()

  const { data: assignedData, error: assignedError } = await client
    .from('user_categories')
    .select('category:categories(*)')
    .eq('user_id', userId)

  if (assignedError) {
    if (isNewCategorySchemaError(assignedError)) {
      return listUserCategoriesFromLegacySchema(userId)
    }

    throw assignedError
  }

  const assignedCategories = ((assignedData ?? []) as unknown as {
    category: CategoryRow | null
  }[])
    .map((row) => row.category)
    .filter((category): category is CategoryRow => Boolean(category))
    .map(mapCategoryRow)

  const { data: usedData, error: usedError } = await client
    .from('entry_categories')
    .select('category:categories(*)')
    .eq('user_id', userId)

  if (usedError) {
    if (isNewCategorySchemaError(usedError)) {
      return uniqueSortedCategories(assignedCategories)
    }

    throw usedError
  }

  const usedCategories = ((usedData ?? []) as unknown as {
    category: CategoryRow | null
  }[])
    .map((row) => row.category)
    .filter((category): category is CategoryRow => Boolean(category))
    .map(mapCategoryRow)

  return uniqueSortedCategories([...assignedCategories, ...usedCategories])
}

export async function createUserCategory(input: {
  userId: string
  name: string
}) {
  const client = getClient()
  const name = normalizeCategoryName(input.name)

  if (!name) {
    throw new Error('Ingresa un nombre para la categoria.')
  }

  try {
    const category = await createGlobalCategory(name)
    const { error: assignError } = await client.from('user_categories').upsert(
      {
        user_id: input.userId,
        category_id: category.id,
      },
      {
        onConflict: 'user_id,category_id',
        ignoreDuplicates: true,
      },
    )

    if (assignError) {
      throw assignError
    }

    return category
  } catch (error) {
    if (isNewCategorySchemaError(error)) {
      return createUserCategoryInLegacySchema(input)
    }

    throw error
  }
}

export async function createManyUserCategories(input: {
  userId: string
  names: string[]
}) {
  const client = getClient()
  const namesByKey = new Map<string, string>()

  for (const rawName of input.names) {
    const name = normalizeCategoryName(rawName)

    if (name) {
      namesByKey.set(normalizeCategoryKey(name), name)
    }
  }

  const normalizedNames = [...namesByKey.keys()]

  if (normalizedNames.length === 0) {
    return []
  }

  try {
    const existingCategories = await fetchCategoriesByKeys(normalizedNames)
    const existingKeys = new Set(
      existingCategories.map((category) => category.normalizedName),
    )
    const missingCategoryRows = normalizedNames
      .filter((normalizedName) => !existingKeys.has(normalizedName))
      .map((normalizedName) => ({
        name: namesByKey.get(normalizedName) ?? normalizedName,
        normalized_name: normalizedName,
      }))

    let createdCategories: CategoryRecord[] = []

    if (missingCategoryRows.length > 0) {
      const { data: created, error: insertError } = await client
        .from('categories')
        .insert(missingCategoryRows)
        .select('*')

      if (insertError && getErrorField(insertError, 'code') !== '23505') {
        throw insertError
      }

      createdCategories = insertError
        ? await fetchCategoriesByKeys(missingCategoryRows.map((row) => row.normalized_name))
        : ((created ?? []) as CategoryRow[]).map(mapCategoryRow)
    }

    const categoryRecords = [...existingCategories, ...createdCategories]
    const assignments = categoryRecords.map((category) => ({
      user_id: input.userId,
      category_id: category.id,
    }))

    const { error: assignError } = await client.from('user_categories').upsert(
      assignments,
      {
        onConflict: 'user_id,category_id',
        ignoreDuplicates: true,
      },
    )

    if (assignError) {
      throw assignError
    }

    return categoryRecords.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    if (!isNewCategorySchemaError(error)) {
      throw error
    }

    const rows = normalizedNames.map((normalizedName) => ({
      user_id: input.userId,
      name: namesByKey.get(normalizedName) ?? normalizedName,
      normalized_name: normalizedName,
    }))

    const { data, error: legacyError } = await client
      .from('user_categories')
      .upsert(rows, {
        onConflict: 'user_id,normalized_name',
        ignoreDuplicates: true,
      })
      .select('*')

    if (legacyError) {
      throw legacyError
    }

    return ((data ?? []) as UserCategoryRow[]).map(mapCategoryRow)
  }
}

export async function deleteUserCategory(input: {
  userId: string
  categoryId: string
}) {
  const client = getClient()

  try {
    const { data: usage, error: usageError } = await client
      .from('entry_categories')
      .select('entry_id')
      .eq('user_id', input.userId)
      .eq('category_id', input.categoryId)
      .limit(1)

    if (usageError) {
      throw usageError
    }

    if (usage && usage.length > 0) {
      throw new Error('No se puede eliminar la categoria porque se esta usando en entradas.')
    }

    const { error: deleteAssignError } = await client
      .from('user_categories')
      .delete()
      .eq('user_id', input.userId)
      .eq('category_id', input.categoryId)

    if (deleteAssignError) {
      throw deleteAssignError
    }
  } catch (error) {
    if (!isNewCategorySchemaError(error)) {
      throw error
    }

    const { data: legacyUsage, error: legacyUsageError } = await client
      .from('entry_user_categories')
      .select('entry_id')
      .eq('user_id', input.userId)
      .eq('user_category_id', input.categoryId)
      .limit(1)

    if (legacyUsageError) {
      throw legacyUsageError
    }

    if (legacyUsage && legacyUsage.length > 0) {
      throw new Error('No se puede eliminar la categoria porque se esta usando en entradas.')
    }

    const { error: legacyError } = await client
      .from('user_categories')
      .delete()
      .eq('id', input.categoryId)
      .eq('user_id', input.userId)

    if (legacyError) {
      throw legacyError
    }
  }
}

export async function listEntryCategories(userId: string, entryIds: string[]) {
  if (entryIds.length === 0) {
    return []
  }

  const client = getClient()

  const { data, error } = await client
    .from('entry_categories')
    .select('*')
    .eq('user_id', userId)
    .in('entry_id', entryIds)

  if (error) {
    if (isNewCategorySchemaError(error)) {
      const { data: legacyData, error: legacyError } = await client
        .from('entry_user_categories')
        .select('*')
        .eq('user_id', userId)
        .in('entry_id', entryIds)

      if (legacyError) {
        throw legacyError
      }

      return ((legacyData ?? []) as EntryUserCategoryRow[]).map(mapEntryUserCategoryRow)
    }

    throw error
  }

  return ((data ?? []) as EntryCategoryRow[]).map(mapEntryCategoryRow)
}

export async function replaceEntryCategories(input: {
  entryId: string
  userId: string
  categoryIds: string[]
}) {
  const client = getClient()

  try {
    const { error: deleteError } = await client
      .from('entry_categories')
      .delete()
      .eq('entry_id', input.entryId)
      .eq('user_id', input.userId)

    if (deleteError) {
      throw deleteError
    }

    if (input.categoryIds.length === 0) {
      return []
    }

    const { error: assignError } = await client.from('user_categories').upsert(
      input.categoryIds.map((categoryId) => ({
        user_id: input.userId,
        category_id: categoryId,
      })),
      {
        onConflict: 'user_id,category_id',
        ignoreDuplicates: true,
      },
    )

    if (assignError) {
      throw assignError
    }

    const { data, error } = await client
      .from('entry_categories')
      .insert(
        input.categoryIds.map((categoryId) => ({
          entry_id: input.entryId,
          user_id: input.userId,
          category_id: categoryId,
        })),
      )
      .select('*')

    if (error) {
      throw error
    }

    return ((data ?? []) as EntryCategoryRow[]).map(mapEntryCategoryRow)
  } catch (error) {
    if (!isNewCategorySchemaError(error)) {
      throw error
    }

    const { error: legacyDeleteError } = await client
      .from('entry_user_categories')
      .delete()
      .eq('entry_id', input.entryId)
      .eq('user_id', input.userId)

    if (legacyDeleteError) {
      throw legacyDeleteError
    }

    if (input.categoryIds.length === 0) {
      return []
    }

    const { data, error: legacyInsertError } = await client
      .from('entry_user_categories')
      .insert(
        input.categoryIds.map((categoryId) => ({
          entry_id: input.entryId,
          user_id: input.userId,
          user_category_id: categoryId,
        })),
      )
      .select('*')

    if (legacyInsertError) {
      throw legacyInsertError
    }

    return ((data ?? []) as EntryUserCategoryRow[]).map(mapEntryUserCategoryRow)
  }
}
