import type { CategoryRecord } from '@/types/categories'
import type { EntryType } from '@/types/entries'

const entryTypeToDefaultCategoryKey: Partial<Record<EntryType, string>> = {
  article: 'articulos',
  book: 'libros',
  movie: 'peliculas',
  place: 'lugares',
  plant: 'plantas',
  recipe: 'recetas',
  series: 'series',
  trip: 'viajes',
}

export function getSuggestedCategoryKeyForEntryType(type: EntryType) {
  return entryTypeToDefaultCategoryKey[type] ?? null
}

export function findSuggestedCategoryForEntryType(
  categories: CategoryRecord[],
  type: EntryType,
) {
  const suggestedCategoryKey = getSuggestedCategoryKeyForEntryType(type)

  if (!suggestedCategoryKey) {
    return null
  }

  return (
    categories.find((category) => category.normalizedName === suggestedCategoryKey) ??
    null
  )
}
