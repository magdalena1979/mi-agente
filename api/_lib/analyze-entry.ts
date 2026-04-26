import Groq from 'groq-sdk'
import { z } from 'zod'

import {
  normalizeAiAnalysis,
} from '../../src/features/ai/schemas'

const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export class AnalyzeEntryValidationError extends Error {}
export class AnalyzeEntryUpstreamError extends Error {}

const optionalStringSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value : ''),
  z.string(),
)

const optionalDataUrlSchema = z.preprocess(
  (value) =>
    typeof value === 'string' && value.startsWith('data:image/')
      ? value
      : undefined,
  z.string().startsWith('data:image/').optional(),
)

const analyzeEntryImageInputSchema = z
  .object({
    name: z.string().min(1).catch('capture'),
    type: z.string().min(1).catch('image/jpeg'),
    position: z.coerce.number().int().min(0).catch(0),
    dataUrl: optionalDataUrlSchema,
  })
  .passthrough()

const analyzeEntryOcrInputSchema = z
  .object({
    name: z.string().min(1).catch('capture'),
    position: z.coerce.number().int().min(0).catch(0),
    text: optionalStringSchema,
    status: z.preprocess(
      (value) => (value === 'error' ? 'error' : 'success'),
      z.enum(['success', 'error']),
    ),
    errorMessage: optionalStringSchema,
  })
  .passthrough()

const analyzeEntryServerRequestSchema = z
  .object({
    combinedExtractedText: optionalStringSchema,
    images: z.preprocess(
      (value) => (Array.isArray(value) ? value : []),
      z.array(analyzeEntryImageInputSchema),
    ),
    ocrTextByImage: z.preprocess(
      (value) => (Array.isArray(value) ? value : []),
      z.array(analyzeEntryOcrInputSchema),
    ),
  })
  .passthrough()

type AnalyzeEntryImageInput = {
  name: string
  type: string
  position: number
  dataUrl?: string
}

type AnalyzeEntryOcrInput = {
  name: string
  position: number
  text: string
  status: 'success' | 'error'
  errorMessage: string
}

type AnalyzeEntryRequest = {
  combinedExtractedText: string
  images: AnalyzeEntryImageInput[]
  ocrTextByImage: AnalyzeEntryOcrInput[]
}

type AnalyzeEntryImageForAi = AnalyzeEntryImageInput & {
  dataUrl: string
}

type AnalyzeEntryPreparedPayload = {
  combinedExtractedText: string
  images: AnalyzeEntryImageForAi[]
  ocrTextByImage: AnalyzeEntryOcrInput[]
}

function normalizeAnalyzeEntryRequest(payload: unknown) {
  const parsedPayload = analyzeEntryServerRequestSchema.safeParse(payload)

  if (!parsedPayload.success) {
    throw new AnalyzeEntryValidationError('El payload de analisis es invalido.')
  }

  return parsedPayload.data as AnalyzeEntryRequest
}

function estimateDataUrlBytes(dataUrl: string) {
  const [, base64Payload = ''] = dataUrl.split(',', 2)
  return Math.ceil((base64Payload.length * 3) / 4)
}

function getImageMimeTypeFromDataUrl(dataUrl: string) {
  const mimeMatch = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,/i)
  return mimeMatch?.[1]?.toLowerCase() ?? ''
}

function cleanText(text: string) {
  return text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
}

function hasUsableOcrText(payload: AnalyzeEntryRequest) {
  return (
    payload.combinedExtractedText.trim().length > 0 ||
    payload.ocrTextByImage.some((item) => item.text.trim().length > 0)
  )
}

function validatePayloadForAi(
  payload: AnalyzeEntryRequest,
): AnalyzeEntryPreparedPayload {
  const imagesWithData = payload.images.filter(
    (image): image is AnalyzeEntryImageForAi => typeof image.dataUrl === 'string',
  )

  if (imagesWithData.length === 0 && !hasUsableOcrText(payload)) {
    throw new AnalyzeEntryValidationError(
      'Necesitamos texto OCR o al menos una captura valida para correr la IA.',
    )
  }

  imagesWithData.forEach((image, index) => {
    const mimeType = getImageMimeTypeFromDataUrl(image.dataUrl)
    const estimatedBytes = estimateDataUrlBytes(image.dataUrl)

    if (!mimeType || !SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
      throw new AnalyzeEntryValidationError(
        `La captura ${index + 1} no tiene un formato compatible para IA.`,
      )
    }

    if (!Number.isFinite(estimatedBytes) || estimatedBytes <= 0) {
      throw new AnalyzeEntryValidationError(
        `La captura ${index + 1} llego vacia o invalida.`,
      )
    }

    if (estimatedBytes > 900_000) {
      throw new AnalyzeEntryValidationError(
        `La captura ${index + 1} sigue siendo demasiado pesada para analizar. Prueba con una imagen mas simple o recortada.`,
      )
    }
  })

  return {
    ...payload,
    images: imagesWithData,
  }
}

export function getAnalyzePayloadDebugSummary(rawPayload: unknown) {
  try {
    const payload = normalizeAnalyzeEntryRequest(rawPayload)
    const imagesWithData = payload.images.filter((image) => Boolean(image.dataUrl))

    return {
      requestMode:
        imagesWithData.length > 0
          ? 'image+ocr'
          : hasUsableOcrText(payload)
            ? 'ocr-only'
            : 'empty',
      imagesCount: payload.images.length,
      usableImagesCount: imagesWithData.length,
      missingImageDataCount: payload.images.length - imagesWithData.length,
      imageDiagnostics: payload.images.map((image) => ({
        name: image.name,
        position: image.position,
        declaredType: image.type,
        hasDataUrl: Boolean(image.dataUrl),
        mimeType: image.dataUrl ? getImageMimeTypeFromDataUrl(image.dataUrl) : null,
        estimatedBytes: image.dataUrl ? estimateDataUrlBytes(image.dataUrl) : null,
      })),
      combinedExtractedTextLength: payload.combinedExtractedText.length,
      ocrItems: payload.ocrTextByImage.length,
      ocrStatuses: payload.ocrTextByImage.map((item) => item.status),
    }
  } catch {
    return {
      invalidPayload: true,
    }
  }
}

function buildPrompt(payload: AnalyzeEntryPreparedPayload) {
  const cleanedCombinedText = cleanText(payload.combinedExtractedText)
  const ocrByImage = payload.ocrTextByImage
    .map((item) => {
      const suffix =
        item.status === 'error'
          ? `OCR error: ${cleanText(item.errorMessage) || 'unknown error'}`
          : cleanText(item.text) || '(no text detected)'

      return `Image ${item.position + 1} - ${item.name}\n${suffix}`
    })
    .join('\n\n')
  const ocrInput = {
    text: cleanedCombinedText,
    source: 'screenshot',
    language: 'auto',
  }

  return [
    'Analyze these screenshots as a single personal entry for a Spanish-language personal catalog app.',
    payload.images.length > 0
      ? 'Use both the screenshot visuals and the OCR text.'
      : 'The request does not include the original screenshot images. Use only the OCR text and do not infer visual UI details that are not supported by the text.',
    'Primary task: extract a title, detect the content type (book, series, movie, article, idea, place, trip, recipe, plant, garden, collection or other), and write a clear useful summary from the OCR text and any available screenshot evidence.',
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
    '- For clearly identified books, enrich the result with useful known facts when confidence is high: brief context about the book, its premise, the author, genre, or why it is notable.',
    '- For clearly identified books, articles or places, you may also add one short useful contextual note in fields.note when it is reliable and helps the user remember why it matters.',
    '- Do not invent facts. Only enrich when the match is strong and the extra data is likely correct.',
    'Output rules:',
    '- title and summary must be in Spanish.',
    '- sourceName should capture the visible source/platform when useful, especially for social screenshots and links.',
    '- sourceName is metadata only. Do not make the summary revolve around the Instagram account, TikTok profile, newsletter sender or person who posted it unless that person is the actual subject of the entry.',
    '- summary should be a short but useful paragraph for the user, not just a plain label.',
    '- summary should ideally have 2 or 3 complete sentences in one paragraph.',
    '- The first sentence should confirm what the item is and focus on the item itself, not on who uploaded or recommended it.',
    '- The second sentence should add a useful plus: context, why it is notable, a reliable extra fact, or a short researched clue that helps the user remember it better.',
    '- Never use the summary just to say that an Instagram user recommended or posted the item. That information belongs in sourceName, not in the core summary.',
    '- If the item is a book and the author is clearly identified, the summary should prioritize describing the book, its premise, tone, theme, or a brief useful context about the writer.',
    '- If the item is a book, prefer 2 or 3 full sentences that leave the user with a better idea of what the book is about or why it may be worth remembering.',
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
    'OCR input object:',
    JSON.stringify(ocrInput, null, 2),
    '',
    'Combined OCR text:',
    cleanedCombinedText || '(empty)',
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

  const payload = validatePayloadForAi(normalizeAnalyzeEntryRequest(rawPayload))
  const client = new Groq({
    apiKey,
    maxRetries: 1,
    timeout: 30000,
  })

  let content: unknown

  try {
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

    content = completion.choices[0]?.message?.content
  } catch (error) {
    throw new AnalyzeEntryUpstreamError(
      error instanceof Error
        ? `La IA no pudo procesar esta captura. ${error.message}`
        : 'La IA no pudo procesar esta captura.',
    )
  }

  if (typeof content !== 'string') {
    throw new AnalyzeEntryUpstreamError('La IA no devolvio contenido utilizable.')
  }

  let parsedContent: unknown

  try {
    parsedContent = JSON.parse(content)
  } catch {
    throw new AnalyzeEntryUpstreamError(
      'La IA devolvio una respuesta invalida para esta entrada.',
    )
  }

  return normalizeAiAnalysis(parsedContent)
}
