import type {
  EntryFieldKey,
  EntryMetadataFields,
  EntryType,
} from '@/types/entries'

type EntryTypeOption = {
  type: EntryType
  label: string
  description: string
  fields: EntryFieldKey[]
}

type EntryFieldDefinition = {
  key: EntryFieldKey
  label: string
  placeholder: string
  input: 'text' | 'textarea'
}

export const entryTypeOptions: EntryTypeOption[] = [
  {
    type: 'book',
    label: 'Libro',
    description: 'Titulo, autor, nota y tags.',
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
    label: 'Pelicula',
    description: 'Plataforma, director, reparto, genero, ano, duracion, nota y tags.',
    fields: ['platform', 'director', 'cast', 'genre', 'year', 'duration', 'note'],
  },
  {
    type: 'series',
    label: 'Serie',
    description: 'Plataforma, reparto, genero, nota y tags.',
    fields: ['platform', 'cast', 'genre', 'note'],
  },
  {
    type: 'article',
    label: 'Articulo',
    description: 'Fuente, resumen, nota y tags.',
    fields: ['note'],
  },
  {
    type: 'place',
    label: 'Lugar',
    description: 'Lugar, nota y tags.',
    fields: ['location', 'note'],
  },
  {
    type: 'trip',
    label: 'Viaje',
    description: 'Destino, fecha, nota y tags.',
    fields: ['location', 'date', 'note'],
  },
  {
    type: 'plant',
    label: 'Planta',
    description: 'Lugar, nota y tags.',
    fields: ['location', 'note'],
  },
  {
    type: 'garden',
    label: 'Huerta',
    description: 'Tema, nota y tags.',
    fields: ['topic', 'note'],
  },
  {
    type: 'collection',
    label: 'Coleccion',
    description: 'Tema, nota y tags.',
    fields: ['topic', 'note'],
  },
  {
    type: 'other',
    label: 'Otro',
    description: 'Titulo libre, nota y tags.',
    fields: ['note'],
  },
]

export const entryFieldsByType = entryTypeOptions.reduce<
  Record<EntryType, EntryFieldKey[]>
>((accumulator, option) => {
  accumulator[option.type] = option.fields
  return accumulator
}, {} as Record<EntryType, EntryFieldKey[]>)

export const entryFieldDefinitions: Record<EntryFieldKey, EntryFieldDefinition> = {
  author: {
    key: 'author',
    label: 'Autor',
    placeholder: 'Ej. Ursula K. Le Guin',
    input: 'text',
  },
  date: {
    key: 'date',
    label: 'Fecha',
    placeholder: 'Ej. 2026-05-10',
    input: 'text',
  },
  time: {
    key: 'time',
    label: 'Hora',
    placeholder: 'Ej. 20:30',
    input: 'text',
  },
  location: {
    key: 'location',
    label: 'Lugar',
    placeholder: 'Ej. Teatro Colon, Buenos Aires, Palermo, patio',
    input: 'text',
  },
  director: {
    key: 'director',
    label: 'Director',
    placeholder: 'Ej. Sofia Coppola',
    input: 'text',
  },
  cast: {
    key: 'cast',
    label: 'Reparto',
    placeholder: 'Ej. Actor 1, Actor 2, Actor 3',
    input: 'text',
  },
  genre: {
    key: 'genre',
    label: 'Genero',
    placeholder: 'Ej. drama, ciencia ficcion',
    input: 'text',
  },
  year: {
    key: 'year',
    label: 'Ano',
    placeholder: 'Ej. 1999',
    input: 'text',
  },
  duration: {
    key: 'duration',
    label: 'Duracion',
    placeholder: 'Ej. 120 min',
    input: 'text',
  },
  platform: {
    key: 'platform',
    label: 'Plataforma',
    placeholder: 'Ej. Netflix, Max, Prime Video',
    input: 'text',
  },
  ingredientsText: {
    key: 'ingredientsText',
    label: 'Ingredientes',
    placeholder: 'Lista de ingredientes o preparacion relevante.',
    input: 'textarea',
  },
  topic: {
    key: 'topic',
    label: 'Tema',
    placeholder: 'Ej. cine coreano, recetas faciles, huerta urbana, plantas de interior',
    input: 'text',
  },
  note: {
    key: 'note',
    label: 'Nota',
    placeholder: 'Observaciones propias o aclaraciones manuales.',
    input: 'textarea',
  },
}

export function getEntryMetadataFieldsForType(type: EntryType) {
  return entryFieldsByType[type]
}

export function getVisibleEntryFieldDefinitions(type: EntryType) {
  return getEntryMetadataFieldsForType(type).map(
    (fieldKey) => entryFieldDefinitions[fieldKey],
  )
}

export function filterMetadataByType(
  type: EntryType,
  metadata: EntryMetadataFields,
) {
  return getEntryMetadataFieldsForType(type).reduce<EntryMetadataFields>(
    (filteredMetadata, fieldKey) => {
      const value = metadata[fieldKey]?.trim()

      if (value) {
        filteredMetadata[fieldKey] = value
      }

      return filteredMetadata
    },
    {},
  )
}
