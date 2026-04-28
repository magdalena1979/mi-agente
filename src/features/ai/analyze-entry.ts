import {
  normalizeAiAnalysis,
  normalizeAnalyzeEntryRequest,
  type AnalyzeEntryRequest,
} from '@/features/ai/schemas'

type ErrorResponse = {
  error?: string
  requestId?: string
}

function cleanText(text: string) {
  return text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeAnalyzeEntryPayload(input: AnalyzeEntryRequest): AnalyzeEntryRequest {
  return {
    ...input,
    combinedExtractedText: cleanText(input.combinedExtractedText ?? ''),
    images: input.images ?? [],
    sourceName: cleanText(input.sourceName ?? ''),
    sourceUrl: input.sourceUrl?.trim() ?? '',
    ocrTextByImage: (input.ocrTextByImage ?? []).map((item) => ({
      ...item,
      text: cleanText(item.text),
      errorMessage: cleanText(item.errorMessage ?? ''),
    })),
  }
}

export async function analyzeEntry(input: AnalyzeEntryRequest) {
  const payload = normalizeAnalyzeEntryRequest(
    normalizeAnalyzeEntryPayload(input),
  )

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
    const requestId =
      data &&
      typeof data === 'object' &&
      'requestId' in data &&
      typeof data.requestId === 'string'
        ? data.requestId
        : response.headers.get('x-request-id')
    const message =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof data.error === 'string'
        ? data.error
        : response.status >= 500
          ? 'No pudimos analizar esta entrada desde el servidor. Si usaste capturas en mobile, prueba con una imagen mas simple o mas recortada.'
          : 'No pudimos analizar esta entrada con IA.'

    throw new Error(requestId ? `${message} (ref: ${requestId})` : message)
  }

  return normalizeAiAnalysis(data)
}
