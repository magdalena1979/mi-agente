export type CategoryRecord = {
  id: string
  name: string
  normalizedName: string
  createdAt: string
}

export type UserCategoryRecord = {
  userId: string
  categoryId: string
  createdAt: string
}

export type EntryCategoryRecord = {
  entryId: string
  userId: string
  categoryId: string
  createdAt: string
}

export const DEFAULT_USER_CATEGORY_NAMES = [
  'Libros',
  'Peliculas',
  'Series',
  'Recetas',
  'Articulos',
  'Lugares',
  'Viajes',
  'Plantas',
  'Ideas',
  'Pendientes',
] as const
