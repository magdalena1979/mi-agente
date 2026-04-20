import Groq from 'groq-sdk'

import {
  normalizeAiAnalysis,
  normalizeAnalyzeEntryRequest,
  type AnalyzeEntryRequest,
} from '../../src/features/ai/schemas'

const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'

function buildPrompt(payload: AnalyzeEntryRequest) {
  const ocrByImage = payload.ocrTextByImage
    .map((item) => {
      const suffix =
        item.status === 'error'
          ? `OCR error: ${item.errorMessage || 'unknown error'}`
          : item.text || '(no text detected)'

      return `Image ${item.position + 1} - ${item.name}\n${suffix}`
    })
    .join('\n\n')

  return [
    'Analyze these screenshots as a single personal entry for a Spanish-language personal catalog app.',
    'Use both the screenshot visuals and the OCR text.',
    'Classify the entry as exactly one of: book, event, recipe, movie, series, article, place, trip, plant, garden, collection, other.',
    'Return valid JSON only.',
    'Important domain rules:',
    '- If the screenshot is clearly from Instagram, set sourceName to "Instagram" or "Instagram @username" when the handle is visible.',
    '- If the screenshot is clearly from TikTok, X, Pinterest, Facebook, YouTube, Reddit, WhatsApp or another known platform, reflect that in sourceName.',
    '- When a social username or handle is visible and reliable, include it in sourceName.',
    '- Streaming screenshots from Prime Video, Netflix, Max, Disney+, YouTube or similar are usually movie or series entries.',
    '- If the capture mentions season, episodio, temporada, episode or chapter, prefer series.',
    '- If the capture shows a runtime in minutes and no season/episode cues, prefer movie.',
    '- Posts, newsletters, interviews, blogs and text-heavy screenshots are usually article entries.',
    '- Maps, restaurant cards, hotels, beaches, stores, museums or saved location screenshots are usually place entries.',
    '- Flights, destinations, itineraries, accommodation lists and travel inspiration are usually trip entries.',
    '- Plant care cards, species names, sun/water recommendations and nursery screenshots are usually plant entries.',
    '- Vegetable garden, sowing calendars, crop associations, compost and orchard planning screenshots are usually garden entries.',
    '- Detect the platform from the app branding whenever possible.',
    '- If the screenshot includes cast labels like reparto, starring, cast or actors, copy them into fields.cast.',
    '- If the screenshot includes director information, copy it into fields.director.',
    '- You may use well-known prior knowledge to enrich missing movie/series details only when the title match is very clear and consistent with the screenshot. If unsure, leave the field empty.',
    'Output rules:',
    '- title and summary must be in Spanish.',
    '- sourceName should capture the visible source/platform when useful, especially for social screenshots and links.',
    '- summary should read like a short confirmation sentence for the user.',
    '- For movie or series, summary should ideally mention genero, plataforma and reparto if available.',
    '- For article, place, trip, plant or garden, summary should mention the main angle in one short sentence.',
    '- tags should be short lowercase strings in Spanish when possible.',
    '- fields must include every supported key and use empty strings when unknown.',
    '- fields.cast should be a comma-separated string.',
    '- confidence must be a number between 0 and 1.',
    'Expected JSON shape:',
    '{"detectedType":"movie","title":"string","summary":"string","sourceName":"Instagram @usuario","tags":["string"],"fields":{"author":"","date":"","time":"","location":"","director":"","cast":"","genre":"","year":"","duration":"","platform":"","ingredientsText":"","topic":"","note":""},"confidence":0.0}',
    '',
    'Combined OCR text:',
    payload.combinedExtractedText || '(empty)',
    '',
    'OCR by image:',
    ocrByImage,
  ].join('\n')
}

export async function analyzeEntryPayload(
  rawPayload: unknown,
  apiKey: string | undefined,
) {
  if (!apiKey) {
    throw new Error('Falta GROQ_API_KEY para analizar entradas.')
  }

  const payload = normalizeAnalyzeEntryRequest(rawPayload)
  const client = new Groq({
    apiKey,
    maxRetries: 1,
    timeout: 30000,
  })

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: {
      type: 'json_object',
    },
    messages: [
      {
        role: 'system',
        content:
          'You extract structured personal catalog entries from screenshots. Reply with strict JSON only and never include markdown fences or explanations.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildPrompt(payload),
          },
          ...payload.images.map((image) => ({
            type: 'image_url' as const,
            image_url: {
              url: image.dataUrl,
            },
          })),
        ],
      },
    ],
  })

  const content = completion.choices[0]?.message?.content

  if (typeof content !== 'string') {
    throw new Error('Groq no devolvio contenido JSON utilizable.')
  }

  let parsedContent: unknown

  try {
    parsedContent = JSON.parse(content)
  } catch {
    throw new Error('Groq devolvio un JSON invalido para esta entrada.')
  }

  return normalizeAiAnalysis(parsedContent)
}
