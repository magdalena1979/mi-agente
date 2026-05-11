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

const entryTypeToDefaultCategoryName: Partial<Record<EntryType, string>> = {
  article: 'Articulos',
  book: 'Libros',
  event: 'Eventos',
  movie: 'Peliculas',
  place: 'Lugares',
  plant: 'Plantas',
  recipe: 'Recetas',
  series: 'Series',
  trip: 'Viajes',
  garden: 'Huerta',
  collection: 'Coleccion',
}

export function getSuggestedCategoryKeyForEntryType(type: EntryType) {
  return entryTypeToDefaultCategoryKey[type] ?? null
}

export function getSuggestedCategoryNameForEntryType(type: EntryType) {
  return entryTypeToDefaultCategoryName[type] ?? null
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
