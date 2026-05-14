import type { EntryRecord } from '@/types/entries'

type CatalogAssistantResponse = {
  answer?: string
  error?: string
}

function compactEntryForAssistant(entry: EntryRecord) {
  return {
    id: entry.id,
    type: entry.type,
    title: entry.title,
    summary: entry.summary,
    sourceName: entry.sourceName,
    status: entry.status,
    aiTags: entry.aiTags,
    updatedAt: entry.updatedAt,
    metadata: entry.metadata,
  }
}

export async function askCatalogAssistant(input: {
  message: string
  entries: EntryRecord[]
}) {
  const response = await fetch('/api/catalog-assistant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: input.message,
      entries: input.entries.map(compactEntryForAssistant),
    }),
  })

  const data = (await response.json().catch(() => null)) as
    | CatalogAssistantResponse
    | null

  if (!response.ok) {
    throw new Error(
      data?.error ?? 'No pudimos responder el chat en este momento.',
    )
  }

  if (!data?.answer) {
    throw new Error('La IA no devolvió una respuesta para el chat.')
  }

  return data.answer
}
