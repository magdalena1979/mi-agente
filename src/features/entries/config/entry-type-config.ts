import type { EntryFieldKey, EntryType } from '@/types/entries'

type EntryTypeOption = {
  type: EntryType
  label: string
  description: string
  fields: EntryFieldKey[]
}

export const entryTypeOptions: EntryTypeOption[] = [
  {
    type: 'book',
    label: 'Libro',
    description: 'Título, autor, nota y tags.',
    fields: ['author', 'note'],
  },
  {
    type: 'event',
    label: 'Evento',
    description: 'Fecha, hora, lugar, nota y tags.',
    fields: ['date', 'time', 'location', 'note'],
  },
  {
    type: 'recipe',
    label: 'Receta',
    description: 'Ingredientes, nota y tags.',
    fields: ['ingredientsText', 'note'],
  },
  {
    type: 'movie',
    label: 'Película',
    description: 'Director, género, año, duración, nota y tags.',
    fields: ['director', 'genre', 'year', 'duration', 'note'],
  },
  {
    type: 'series',
    label: 'Serie',
    description: 'Plataforma, género, nota y tags.',
    fields: ['platform', 'genre', 'note'],
  },
  {
    type: 'collection',
    label: 'Colección',
    description: 'Tema, nota y tags.',
    fields: ['topic', 'note'],
  },
  {
    type: 'other',
    label: 'Otro',
    description: 'Título libre, nota y tags.',
    fields: ['note'],
  },
]
