import { z } from 'zod'

import {
  filterMetadataByType,
  getEntryMetadataFieldsForType,
} from '@/features/entries/config/entry-type-config'
import {
  ENTRY_FIELD_KEYS,
  ENTRY_TYPES,
  type AiAnalysisResult,
  type EntryFieldKey,
  type EntryMetadataFields,
  type EntryRecord,
  type EntrySourceType,
  type EntryStatus,
} from '@/types/entries'

export const entryStatusOptions: EntryStatus[] = [
  'draft',
  'reviewed',
]

export const entrySourceOptions: EntrySourceType[] = ['screenshot', 'manual', 'link']

const metadataShape = ENTRY_FIELD_KEYS.reduce<
  Record<EntryFieldKey, z.ZodString>
>((shape, fieldKey) => {
  shape[fieldKey] = z.string()
  return shape
}, {} as Record<EntryFieldKey, z.ZodString>)

export const entryFormSchema = z.object({
  type: z.enum(ENTRY_TYPES),
  title: z.string().trim().min(1, 'El titulo es obligatorio.'),
  summary: z.string().trim(),
  sourceType: z.enum(['screenshot', 'manual', 'link']),
  sourceName: z.string().trim(),
  sourceUrl: z.string().trim(),
  status: z.enum(['draft', 'reviewed']),
  tagsText: z.string(),
  extractedText: z.string(),
  ...metadataShape,
})

export type EntryFormValues = z.infer<typeof entryFormSchema>

function normalizeEditableStatus(status?: EntryStatus | null): EntryFormValues['status'] {
  if (status === 'reviewed') {
    return 'reviewed'
  }

  return 'draft'
}

function createEmptyMetadataValues() {
  return ENTRY_FIELD_KEYS.reduce<Record<EntryFieldKey, string>>(
    (values, fieldKey) => {
      values[fieldKey] = ''
      return values
    },
    {} as Record<EntryFieldKey, string>,
  )
}

export function createEmptyEntryFormValues(
  overrides: Partial<EntryFormValues> = {},
): EntryFormValues {
  return {
    type: 'other',
    title: '',
    summary: '',
    sourceType: 'screenshot',
    sourceName: '',
    sourceUrl: '',
    status: 'draft',
    tagsText: '',
    extractedText: '',
    ...createEmptyMetadataValues(),
    ...overrides,
  }
}

export function getEntryFormDefaultValues(
  entry?: EntryRecord | null,
): EntryFormValues {
  if (!entry) {
    return createEmptyEntryFormValues()
  }

  const metadataValues = createEmptyMetadataValues()

  for (const fieldKey of ENTRY_FIELD_KEYS) {
    metadataValues[fieldKey] = entry.metadata[fieldKey] ?? ''
  }

  return createEmptyEntryFormValues({
    type: entry.type,
    title: entry.title,
    summary: entry.summary,
    sourceType: entry.sourceType,
    sourceName: entry.sourceName ?? '',
    sourceUrl: entry.sourceUrl ?? '',
    status: normalizeEditableStatus(entry.status),
    tagsText: entry.aiTags.join(', '),
    extractedText: entry.extractedText,
    ...metadataValues,
  })
}

export function getEntryFormValuesFromAnalysis(
  analysis: AiAnalysisResult | null,
  extractedText: string,
) {
  if (!analysis) {
    return createEmptyEntryFormValues({
      extractedText,
      sourceType: 'screenshot',
    })
  }

  const metadataValues = createEmptyMetadataValues()

  for (const fieldKey of ENTRY_FIELD_KEYS) {
    metadataValues[fieldKey] = analysis.fields[fieldKey] ?? ''
  }

  return createEmptyEntryFormValues({
    type: analysis.detectedType,
    title: analysis.title,
    summary: analysis.summary,
    sourceName: analysis.sourceName,
    sourceType: 'screenshot',
    status: 'draft',
    tagsText: analysis.tags.join(', '),
    extractedText,
    ...metadataValues,
  })
}

export function getEntryMetadataFromForm(
  values: EntryFormValues,
): EntryMetadataFields {
  const rawMetadata = getEntryMetadataFieldsForType(values.type).reduce<
    EntryMetadataFields
  >((metadata, fieldKey) => {
    metadata[fieldKey] = values[fieldKey]
    return metadata
  }, {})

  return filterMetadataByType(values.type, rawMetadata)
}

export function parseTags(tagsText: string) {
  return tagsText
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
}
