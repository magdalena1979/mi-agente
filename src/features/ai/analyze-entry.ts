import {
  normalizeAiAnalysis,
  normalizeAnalyzeEntryRequest,
  type AnalyzeEntryRequest,
} from '@/features/ai/schemas'

type ErrorResponse = {
  error?: string
}

export async function analyzeEntry(input: AnalyzeEntryRequest) {
  const payload = normalizeAnalyzeEntryRequest(input)

  const response = await fetch('/api/analyze-entry', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = (await response.json().catch(() => null)) as
    | ErrorResponse
    | unknown

  if (!response.ok) {
    const message =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof data.error === 'string'
        ? data.error
        : 'No pudimos analizar las capturas con IA.'

    throw new Error(message)
  }

  return normalizeAiAnalysis(data)
}
