export type UserCategoryRecord = {
  id: string
  userId: string
  name: string
  normalizedName: string
  createdAt: string
}

export type EntryUserCategoryRecord = {
  entryId: string
  userId: string
  userCategoryId: string
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
