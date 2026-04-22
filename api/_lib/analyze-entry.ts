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
    '- Treat the visual UI as evidence, not just OCR text. If you see a profile header, Follow/Seguir button, like/comment/share icons, Instagram-style carousel dots, reels/post layout or an Instagram profile/post composition, identify it as Instagram even if the OCR misses the word Instagram.',
    '- When an Instagram handle is visible in the header, caption or account row, prefer sourceName = "Instagram @handle".',
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
    '- For clearly identified movies or series, enrich the result with useful known facts when confidence is high: genre, year, duration, country/cinematic context in fields.note, notable cast, director, or likely platform only if you are confident.',
    '- For clearly identified books, articles or places, you may also add one short useful contextual note in fields.note when it is reliable and helps the user remember why it matters.',
    '- Do not invent facts. Only enrich when the match is strong and the extra data is likely correct.',
    'Output rules:',
    '- title and summary must be in Spanish.',
    '- sourceName should capture the visible source/platform when useful, especially for social screenshots and links.',
    '- summary should be a short but useful paragraph for the user, not just a plain label.',
    '- summary should ideally have 2 or 3 complete sentences in one paragraph.',
    '- The first sentence should confirm what the item is.',
    '- The second sentence should add a useful plus: context, why it is notable, a reliable extra fact, or a short researched clue that helps the user remember it better.',
    '- If the item is a book and the author is clearly identified, the summary may include a brief useful context line about the writer or why the book matters.',
    '- If the item is a movie or series, summary should ideally mention genero, director, year, plataforma or cultural context when available.',
    '- If the item is an article, place, trip, plant or garden entry, summary should mention the main angle plus one extra helpful detail when reliable.',
    '- If you cannot enrich confidently, still write a helpful paragraph, but do not invent facts.',
    '- tags should be short lowercase strings in Spanish when possible.',
    '- fields must include every supported key and use empty strings when unknown.',
    '- fields.cast should be a comma-separated string.',
    '- fields.note is the right place for one extra interesting fact or context when it genuinely adds value.',
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
