export const ENTRY_TYPES = [
  'book',
  'event',
  'recipe',
  'movie',
  'series',
  'collection',
  'other',
] as const

export type EntryType = (typeof ENTRY_TYPES)[number]

export const ENTRY_FIELD_KEYS = [
  'author',
  'date',
  'time',
  'location',
  'director',
  'genre',
  'year',
  'duration',
  'platform',
  'ingredientsText',
  'topic',
  'note',
] as const

export type EntryFieldKey = (typeof ENTRY_FIELD_KEYS)[number]

export type EntryStatus = 'draft' | 'reviewed' | 'archived'
export type EntrySourceType = 'screenshot' | 'manual'

export type EntryMetadataFields = Partial<Record<EntryFieldKey, string>>

export type EntryRecord = {
  id: string
  userId: string
  type: EntryType
  title: string
  summary: string
  sourceType: EntrySourceType
  sourceName: string | null
  status: EntryStatus
  aiTags: string[]
  extractedText: string
  metadata: EntryMetadataFields
  createdAt: string
  updatedAt: string
}

export type EntryImageRecord = {
  id: string
  entryId: string
  imagePath: string
  imageUrl: string | null
  position: number
  ocrText: string
  createdAt: string
}

export type AiAnalysisResult = {
  detectedType: EntryType
  title: string
  summary: string
  tags: string[]
  fields: EntryMetadataFields
  confidence: number
}
