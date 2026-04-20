export const ENTRY_TYPES = [
  'book',
  'event',
  'recipe',
  'movie',
  'series',
  'article',
  'place',
  'trip',
  'plant',
  'garden',
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
  'cast',
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
export type PendingUploadOcrStatus = 'idle' | 'processing' | 'success' | 'error'

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

export type PendingUploadImage = {
  id: string
  file: File
  previewUrl: string
  position: number
  ocrText: string
  ocrStatus: PendingUploadOcrStatus
  ocrErrorMessage: string | null
}

export type AiAnalysisResult = {
  detectedType: EntryType
  title: string
  summary: string
  tags: string[]
  fields: EntryMetadataFields
  confidence: number
}
