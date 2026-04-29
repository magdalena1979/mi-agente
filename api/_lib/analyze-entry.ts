import Groq from 'groq-sdk'
import { z } from 'zod'

const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])
const ENTRY_TYPES = [
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

export class AnalyzeEntryValidationError extends Error {}
export class AnalyzeEntryUpstreamError extends Error {}

const emptyAiFields = {
  author: '',
  date: '',
  time: '',
  location: '',
  director: '',
  cast: '',
  genre: '',
  year: '',
  duration: '',
  platform: '',
  ingredientsText: '',
  topic: '',
  note: '',
}

const aiFieldSchema = z
  .object({
    author: z.string().default(''),
    date: z.string().default(''),
    time: z.string().default(''),
    location: z.string().default(''),
    director: z.string().default(''),
    cast: z.string().default(''),
    genre: z.string().default(''),
    year: z.string().default(''),
    duration: z.string().default(''),
    platform: z.string().default(''),
    ingredientsText: z.string().default(''),
    topic: z.string().default(''),
    note: z.string().default(''),
  })
  .strict()

const aiAnalysisSchema = z
  .object({
    detectedType: z.enum(ENTRY_TYPES).default('other'),
    title: z.string().default(''),
    summary: z.string().default(''),
    sourceName: z.string().default(''),
    tags: z.array(z.string()).default([]),
    fields: aiFieldSchema.default(emptyAiFields),
    confidence: z.number().min(0).max(1).default(0),
  })
  .strict()

function normalizeAiAnalysis(payload: unknown) {
  return aiAnalysisSchema.parse(payload)
}

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
    sourceType: z.preprocess(
      (value) =>
        value === 'link' || value === 'manual' || value === 'screenshot'
          ? value
          : 'screenshot',
      z.enum(['screenshot', 'manual', 'link']),
    ),
    sourceName: optionalStringSchema,
    sourceUrl: optionalStringSchema,
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
  sourceType: 'screenshot' | 'manual' | 'link'
  sourceName: string
  sourceUrl: string
}

type AnalyzeEntryImageForAi = AnalyzeEntryImageInput & {
  dataUrl: string
}

type AnalyzeEntryPreparedPayload = {
  combinedExtractedText: string
  images: AnalyzeEntryImageForAi[]
  ocrTextByImage: AnalyzeEntryOcrInput[]
  sourceType: 'screenshot' | 'manual' | 'link'
  sourceName: string
  sourceUrl: string
}

type LinkPreviewData = {
  finalUrl: string
  title: string
  description: string
  siteName: string
  openGraphType: string
}

type LinkEvidenceData = {
  preview: LinkPreviewData | null
  readerText: string
  metaOEmbedText: string
}

type AnalyzeEntryRuntimeConfig = {
  metaAppId?: string
  metaAppSecret?: string
  metaOEmbedAccessToken?: string
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

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function extractHtmlTagContent(html: string, tagName: string) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i'))
  return cleanText(decodeHtmlEntities(match?.[1] ?? ''))
}

function extractHtmlMetaContent(html: string, attributeName: 'property' | 'name', attributeValue: string) {
  const escapedValue = attributeValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const doubleQuoted = html.match(
    new RegExp(
      `<meta[^>]*${attributeName}=["']${escapedValue}["'][^>]*content=["']([^"']*)["'][^>]*>`,
      'i',
    ),
  )

  if (doubleQuoted?.[1]) {
    return cleanText(decodeHtmlEntities(doubleQuoted[1]))
  }

  const reversed = html.match(
    new RegExp(
      `<meta[^>]*content=["']([^"']*)["'][^>]*${attributeName}=["']${escapedValue}["'][^>]*>`,
      'i',
    ),
  )

  return cleanText(decodeHtmlEntities(reversed?.[1] ?? ''))
}

async function fetchLinkPreviewData(sourceUrl: string): Promise<LinkPreviewData | null> {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(sourceUrl)
  } catch {
    return null
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return null
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(parsedUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      },
    })

    if (!response.ok) {
      return null
    }

    const contentType = response.headers.get('content-type') ?? ''

    if (!contentType.toLowerCase().includes('text/html')) {
      return null
    }

    const html = await response.text()
    const title =
      extractHtmlMetaContent(html, 'property', 'og:title') ||
      extractHtmlMetaContent(html, 'name', 'twitter:title') ||
      extractHtmlTagContent(html, 'title')
    const description =
      extractHtmlMetaContent(html, 'property', 'og:description') ||
      extractHtmlMetaContent(html, 'name', 'description') ||
      extractHtmlMetaContent(html, 'name', 'twitter:description')
    const siteName =
      extractHtmlMetaContent(html, 'property', 'og:site_name') ||
      parsedUrl.hostname.replace(/^www\./i, '')
    const openGraphType = extractHtmlMetaContent(html, 'property', 'og:type')

    if (!title && !description) {
      return null
    }

    return {
      finalUrl: response.url || parsedUrl.toString(),
      title,
      description,
      siteName,
      openGraphType,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchReaderTextFromUrl(sourceUrl: string): Promise<string> {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(sourceUrl)
  } catch {
    return ''
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return ''
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 12000)

  try {
    const headers: Record<string, string> = {
      Accept: 'text/plain',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      'X-Respond-With': 'text',
    }

    if (process.env.JINA_API_KEY) {
      headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`
    }

    const response = await fetch(`https://r.jina.ai/${parsedUrl.toString()}`, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers,
    })

    if (!response.ok) {
      return ''
    }

    const text = cleanText(await response.text())

    if (!text) {
      return ''
    }

    return text.slice(0, 12000)
  } catch {
    return ''
  } finally {
    clearTimeout(timeoutId)
  }
}

function buildMetaOEmbedAccessToken(runtimeConfig?: AnalyzeEntryRuntimeConfig) {
  const directToken =
    runtimeConfig?.metaOEmbedAccessToken?.trim() || process.env.META_OEMBED_ACCESS_TOKEN?.trim() || ''

  if (directToken) {
    return directToken
  }

  const appId = runtimeConfig?.metaAppId?.trim() || process.env.META_APP_ID?.trim() || ''
  const appSecret =
    runtimeConfig?.metaAppSecret?.trim() || process.env.META_APP_SECRET?.trim() || ''

  if (!appId || !appSecret) {
    return ''
  }

  return `${appId}|${appSecret}`
}

async function fetchMetaInstagramOEmbedText(
  sourceUrl: string,
  runtimeConfig?: AnalyzeEntryRuntimeConfig,
): Promise<string> {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(sourceUrl)
  } catch {
    return ''
  }

  if (!parsedUrl.hostname.toLowerCase().includes('instagram.com')) {
    return ''
  }

  const accessToken = buildMetaOEmbedAccessToken(runtimeConfig)

  if (!accessToken) {
    return ''
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const oembedUrl = new URL('https://graph.facebook.com/v23.0/instagram_oembed')
    oembedUrl.searchParams.set('url', parsedUrl.toString())
    oembedUrl.searchParams.set('access_token', accessToken)
    oembedUrl.searchParams.set('omitscript', 'true')
    oembedUrl.searchParams.set('hidecaption', 'false')

    const response = await fetch(oembedUrl.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      return ''
    }

    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null

    if (!payload || typeof payload !== 'object') {
      return ''
    }

    const title =
      typeof payload.title === 'string' ? cleanText(payload.title) : ''
    const authorName =
      typeof payload.author_name === 'string' ? cleanText(payload.author_name) : ''
    const providerName =
      typeof payload.provider_name === 'string' ? cleanText(payload.provider_name) : ''
    const html =
      typeof payload.html === 'string'
        ? cleanText(payload.html.replace(/<[^>]+>/g, ' '))
        : ''

    return cleanText(
      [
        providerName ? `Plataforma: ${providerName}` : '',
        authorName ? `Autor: ${authorName}` : '',
        title ? `Titulo o caption: ${title}` : '',
        html ? `Embed: ${html}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  } catch {
    return ''
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchLinkEvidenceWithRuntimeConfig(
  sourceUrl: string,
  runtimeConfig?: AnalyzeEntryRuntimeConfig,
): Promise<LinkEvidenceData> {
  const preview = await fetchLinkPreviewData(sourceUrl)
  const readerText = await fetchReaderTextFromUrl(sourceUrl)
  const metaOEmbedText = await fetchMetaInstagramOEmbedText(sourceUrl, runtimeConfig)

  return {
    preview,
    readerText,
    metaOEmbedText,
  }
}

function hasUsableOcrText(payload: AnalyzeEntryRequest) {
  return (
    payload.combinedExtractedText.trim().length > 0 ||
    payload.ocrTextByImage.some((item) => item.text.trim().length > 0)
  )
}

function hasUsableLinkSource(payload: AnalyzeEntryRequest) {
  return payload.sourceType === 'link' && payload.sourceUrl.trim().length > 0
}

function validatePayloadForAi(
  payload: AnalyzeEntryRequest,
): AnalyzeEntryPreparedPayload {
  const imagesWithData = payload.images.filter(
    (image): image is AnalyzeEntryImageForAi => typeof image.dataUrl === 'string',
  )

  if (
    imagesWithData.length === 0 &&
    !hasUsableOcrText(payload) &&
    !hasUsableLinkSource(payload)
  ) {
    throw new AnalyzeEntryValidationError(
      'Necesitamos un link valido, texto OCR o al menos una captura valida para correr la IA.',
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
          : hasUsableLinkSource(payload)
            ? 'link-only'
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

function buildPrompt(payload: AnalyzeEntryPreparedPayload, linkEvidence: LinkEvidenceData | null) {
  const cleanedCombinedText = cleanText(payload.combinedExtractedText)
  const cleanedSourceName = cleanText(payload.sourceName)
  const cleanedSourceUrl = payload.sourceUrl.trim()
  const isLinkSource = payload.sourceType === 'link' && cleanedSourceUrl.length > 0
  const linkPreview = linkEvidence?.preview ?? null
  const linkReaderText = cleanText(linkEvidence?.readerText ?? '')
  const metaOEmbedText = cleanText(linkEvidence?.metaOEmbedText ?? '')
  const linkPreviewSummary =
    linkPreview === null
      ? null
      : {
          finalUrl: linkPreview.finalUrl,
          siteName: linkPreview.siteName,
          openGraphType: linkPreview.openGraphType,
          title: linkPreview.title,
          description: linkPreview.description,
        }
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
    source: isLinkSource ? 'link' : 'screenshot',
    language: 'auto',
  }

  return [
    isLinkSource
      ? 'Analyze this link as a single personal entry for a Spanish-language personal catalog app.'
      : 'Analyze these screenshots as a single personal entry for a Spanish-language personal catalog app.',
    payload.images.length > 0
      ? 'Use both the screenshot visuals and the OCR text.'
      : isLinkSource
        ? 'The request includes a link without screenshots. Use the URL, the detected platform/source, and any reliable clues from the text. Do not pretend you visited the page if the URL is ambiguous.'
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
    '- If the source is a link, use the URL structure, slug, host and platform hints to infer the item only when reliable. If the URL is too opaque, keep the title and summary conservative and do not invent details.',
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
    'Source context:',
    JSON.stringify(
      {
        sourceType: payload.sourceType,
        sourceName: cleanedSourceName,
        sourceUrl: cleanedSourceUrl,
      },
      null,
      2,
    ),
    '',
    'Fetched link preview:',
    linkPreviewSummary ? JSON.stringify(linkPreviewSummary, null, 2) : '(none)',
    '',
    'Fetched link reader text:',
    linkReaderText || '(none)',
    '',
    'Fetched Meta oEmbed text:',
    metaOEmbedText || '(none)',
    '',
    'OCR input object:',
    JSON.stringify(ocrInput, null, 2),
    '',
    'Combined OCR text:',
    cleanedCombinedText || '(empty)',
    '',
    'OCR by image:',
    ocrByImage || '(none)',
  ].join('\n')
}

function hasMeaningfulAnalysisContent(result: z.infer<typeof aiAnalysisSchema>) {
  if (cleanText(result.title).length > 0 || cleanText(result.summary).length > 0) {
    return true
  }

  if (result.tags.some((tag) => cleanText(tag).length > 0)) {
    return true
  }

  return Object.values(result.fields).some((value) => cleanText(value).length > 0)
}

function createLinkFallbackAnalysis(
  result: z.infer<typeof aiAnalysisSchema>,
  payload: AnalyzeEntryPreparedPayload,
  linkEvidence: LinkEvidenceData | null,
) {
  const linkPreview = linkEvidence?.preview ?? null
  const linkReaderText = cleanText(linkEvidence?.readerText ?? '')
  const metaOEmbedText = cleanText(linkEvidence?.metaOEmbedText ?? '')

  if (!hasUsableLinkSource(payload) || linkPreview === null || hasMeaningfulAnalysisContent(result)) {
    if (hasUsableLinkSource(payload) && !hasMeaningfulAnalysisContent(result) && (metaOEmbedText || linkReaderText)) {
      const fallbackLines = (metaOEmbedText || linkReaderText)
        .split(/(?<=[.!?])\s+/)
        .map((line) => cleanText(line))
        .filter(Boolean)
      const fallbackTitle = cleanText(linkPreview?.title ?? payload.sourceName)
      const fallbackSummary = fallbackLines.slice(0, 2).join(' ').slice(0, 420)

      return {
        ...result,
        detectedType: result.detectedType === 'other' ? 'article' : result.detectedType,
        title: fallbackTitle,
        summary: fallbackSummary,
        sourceName:
          cleanText(result.sourceName) ||
          cleanText(payload.sourceName) ||
          cleanText(linkPreview?.siteName ?? ''),
        tags: result.tags.length > 0 ? result.tags : ['link'],
        confidence: result.confidence > 0 ? result.confidence : 0.42,
      }
    }

    return result
  }

  const fallbackTitle =
    cleanText(linkPreview.title) ||
    cleanText(payload.sourceName) ||
    cleanText(linkPreview.siteName)
  const fallbackSummary =
    cleanText(linkPreview.description) ||
    (fallbackTitle
      ? `Contenido enlazado desde ${cleanText(linkPreview.siteName) || 'la web'}.`
      : '')
  const fallbackSourceName =
    cleanText(result.sourceName) ||
    cleanText(payload.sourceName) ||
    cleanText(linkPreview.siteName)
  const lowerHost = (() => {
    try {
      return new URL(linkPreview.finalUrl).hostname.toLowerCase()
    } catch {
      return ''
    }
  })()

  return {
    ...result,
    detectedType:
      result.detectedType === 'other' && lowerHost.includes('instagram.com')
        ? 'article'
        : result.detectedType,
    title: fallbackTitle,
    summary: fallbackSummary,
    sourceName: fallbackSourceName,
    tags:
      result.tags.length > 0
        ? result.tags
        : lowerHost.includes('instagram.com')
          ? ['instagram']
          : result.tags,
    confidence: result.confidence > 0 ? result.confidence : 0.35,
  }
}

export async function analyzeEntryPayload(
  rawPayload: unknown,
  apiKey: string | undefined,
  runtimeConfig?: AnalyzeEntryRuntimeConfig,
) {
  if (!apiKey) {
    throw new Error('Falta GROQ_API_KEY para analizar entradas.')
  }

  const payload = validatePayloadForAi(normalizeAnalyzeEntryRequest(rawPayload))
  const linkEvidence = hasUsableLinkSource(payload)
    ? await fetchLinkEvidenceWithRuntimeConfig(payload.sourceUrl, runtimeConfig)
    : null
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
            'You extract structured personal catalog entries from screenshots or links. Reply with strict JSON only and never include markdown fences or explanations.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildPrompt(payload, linkEvidence),
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
        ? `La IA no pudo procesar esta entrada. ${error.message}`
        : 'La IA no pudo procesar esta entrada.',
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

  return createLinkFallbackAnalysis(normalizeAiAnalysis(parsedContent), payload, linkEvidence)
}
