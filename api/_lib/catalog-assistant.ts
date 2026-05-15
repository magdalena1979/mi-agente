import Groq from 'groq-sdk'
import { z } from 'zod'

const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'
const MAX_CATALOG_ITEMS = 90
const OUT_OF_SCOPE_ANSWER =
  'Solo puedo ayudarte con cosas de Refind: tu biblioteca, entries, tags, capturas, links, PDFs, búsquedas y cómo funciona la app.'
const APP_SCOPE_KEYWORDS = [
  'app',
  'refind',
  'biblioteca',
  'catálogo',
  'catálogo',
  'entry',
  'entries',
  'entrada',
  'entradas',
  'captura',
  'capturas',
  'imagen',
  'imagenes',
  'imágenes',
  'link',
  'links',
  'pdf',
  'ocr',
  'ia',
  'analizar',
  'analisis',
  'análisis',
  'limite',
  'límite',
  'maximo',
  'máximo',
  'cuantas',
  'cuántas',
  'cuanto',
  'cuánto',
  'funciona',
  'usar',
  'uso',
  'puedo',
  'agregar',
  'descargar',
  'descarga',
  'editar',
  'edicion',
  'edición',
  'archivo',
  'archivar',
  'guardar',
  'guardado',
  'guardada',
  'cargue',
  'cargué',
  'cargado',
  'subí',
  'subí',
  'pendiente',
  'pendientes',
  'tag',
  'tags',
  'buscar',
  'busca',
  'mostrame',
  'mostrar',
  'resumen',
  'resumir',
  'receta',
  'recetas',
  'peli',
  'película',
  'película',
  'películas',
  'películas',
  'serie',
  'series',
  'libro',
  'libros',
  'lugar',
  'lugares',
  'viaje',
  'viajes',
  'planta',
  'plantas',
  'huerta',
  'evento',
  'eventos',
  'género',
  'género',
  'director',
  'autor',
  'plataforma',
]

export class CatalogAssistantVálidationError extends Error {}
export class CatalogAssistantUpstreamError extends Error {}

const catalogEntrySchema = z
  .object({
    id: z.string().default(''),
    type: z.string().default('other'),
    title: z.string().default(''),
    summary: z.string().default(''),
    sourceName: z.string().nullable().default(null),
    status: z.string().default('draft'),
    aiTags: z.array(z.string()).default([]),
    updatedAt: z.string().default(''),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough()

const catalogAssistantRequestSchema = z
  .object({
    message: z.string().trim().min(1),
    entries: z.array(catalogEntrySchema).default([]),
  })
  .strict()

type CatalogAssistantEntry = z.infer<typeof catalogEntrySchema>

function cleanText(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isCatalogScopedMessage(message: string, entries: CatalogAssistantEntry[]) {
  const normalizedMessage = normalizeText(message)

  if (
    APP_SCOPE_KEYWORDS.some((keyword) =>
      normalizedMessage.includes(normalizeText(keyword)),
    )
  ) {
    return true
  }

  return entries.some((entry) => {
    const entryText = normalizeText(
      [
        entry.title,
        entry.summary,
        entry.type,
        entry.sourceName ?? '',
        entry.aiTags.join(' '),
      ].join(' '),
    )

    return (
      cleanText(entry.title).length > 2 &&
      normalizedMessage.includes(normalizeText(entry.title))
    ) || normalizedMessage
      .split(/\s+/)
      .some((token) => token.length > 3 && entryText.includes(token))
  })
}

function answerPlatformUsageQuestion(message: string) {
  const normalizedMessage = normalizeText(message)
  const mentionsCaptures =
    normalizedMessage.includes('captura') ||
    normalizedMessage.includes('imagen') ||
    normalizedMessage.includes('foto')

  if (
    mentionsCaptures &&
    /(cuantas|cuantos|limite|maximo|agregar|subir|permit)/.test(normalizedMessage)
  ) {
    return 'Podés agregar hasta 2 capturas por entry. Si una entry ya tiene 2 capturas, Refind oculta la opción de agregar más para mantener el análisis liviano y no ocupar espacio innecesario.'
  }

  if (normalizedMessage.includes('pdf')) {
    return 'Podés subir un PDF al crear una entry. Refind guarda el PDF original en Storage, usa páginas livianas para OCR/IA y después podés buscar la entry por su contenido o descargar el PDF desde el detalle.'
  }

  if (
    normalizedMessage.includes('volver a analizar') ||
    normalizedMessage.includes('reanali') ||
    (normalizedMessage.includes('ia') && normalizedMessage.includes('analiz'))
  ) {
    return 'La opción “Volver a analizar con IA” aparece dentro del modo edición. Cada entry tiene un límite de 2 análisis con IA para controlar uso y costo.'
  }

  if (normalizedMessage.includes('descargar') || normalizedMessage.includes('bajar')) {
    return 'En el detalle de una entry podés usar el icono de descarga. Si la entry nació de un PDF, baja el PDF original; en otros casos baja una ficha PDF con la información principal.'
  }

  if (normalizedMessage.includes('editar') || normalizedMessage.includes('edicion')) {
    return 'Para editar una entry, tocá el icono de lápiz. En edición vas a ver una barra superior con Cancelar y Guardar, y los campos organizados en secciones.'
  }

  if (normalizedMessage.includes('tag') || normalizedMessage.includes('categoria')) {
    return 'Los tags sirven para filtrar y ordenar tu biblioteca. Refind puede sugerir tags con IA, y también podés gestionarlos desde la biblioteca o al editar una entry.'
  }

  if (normalizedMessage.includes('como funciona') || normalizedMessage.includes('funciona')) {
    return 'Refind guarda capturas, PDFs o links como entries. Primero carga el contenido, después usa OCR/IA para armar una ficha editable y finalmente la guarda en tu biblioteca para buscarla por título, tags, tipo o fuente.'
  }

  return null
}

function normalizeEntryForPrompt(entry: CatalogAssistantEntry) {
  const metadata = entry.metadata ?? {}
  const getMetadataValue = (key: string) =>
    typeof metadata[key] === 'string' ? cleanText(metadata[key]) : ''

  return {
    type: entry.type,
    title: cleanText(entry.title),
    summary: cleanText(entry.summary).slice(0, 360),
    tags: entry.aiTags.map(cleanText).filter(Boolean).slice(0, 8),
    sourceName: cleanText(entry.sourceName ?? ''),
    status: entry.status,
    updatedAt: entry.updatedAt,
    metadata: {
      author: getMetadataValue('author'),
      director: getMetadataValue('director'),
      cast: getMetadataValue('cast'),
      genre: getMetadataValue('genre'),
      year: getMetadataValue('year'),
      duration: getMetadataValue('duration'),
      platform: getMetadataValue('platform'),
      topic: getMetadataValue('topic'),
      note: getMetadataValue('note').slice(0, 260),
      location: getMetadataValue('location'),
      date: getMetadataValue('date'),
    },
  }
}

function buildPrompt(message: string, entries: CatalogAssistantEntry[]) {
  const catalog = entries
    .slice()
    .sort((leftEntry, rightEntry) =>
      rightEntry.updatedAt.localeCompare(leftEntry.updatedAt),
    )
    .slice(0, MAX_CATALOG_ITEMS)
    .map(normalizeEntryForPrompt)

  return [
    'Sos el asistente conversacional de Refind, una biblioteca personal de capturas, links, películas, libros, recetas, lugares y notas.',
    'Responde siempre en español claro, formal, neutral y útil.',
    'No uses muletillas ni vocativos coloquiales como "che", "bolu", "genia", "amiga", "de una" o similares.',
    'No fuerces tono simpático: prioriza precisión, sobriedad y claridad.',
    'Usa el catálogo del usuario como fuente principal. Si recomendás algo, prioriza items ya guardados.',
    'También podés responder preguntas sobre cómo funciona Refind, sus límites y flujos de uso.',
    'Datos de producto: cada entry admite hasta 2 capturas; los PDF se guardan como archivo original en Storage, se procesan con páginas livianas para OCR/IA y se pueden descargar desde el detalle; Volver a analizar con IA está en edición y cada entry tiene hasta 2 análisis; las entries se pueden editar con el icono de lápiz; los tags ayudan a filtrar la biblioteca.',
    'Límite estricto: solo podés responder sobre Refind, cómo usar la app y la biblioteca provista. Si el mensaje pide conocimiento general, clima, noticias, matemática, programación, salud, legal, finanzas, tareas escolares o cualquier cosa no relacionada con la app o las entradas guardadas, responde brevemente que solo podés ayudar con Refind.',
    'Si la persona pide algo como "que peli drama puedo ver", busca películas o series con género, tags, resumen o nota compatible, y da 2 a 5 opciones con una razón corta.',
    'Si pide "que libros cargue últimamente", ordena por updatedAt y menciona los libros más recientes.',
    'Si pregunta por un tema, condición o tag específico, por ejemplo diabetes, astrología, Cannes o drama, solo responde con entradas que contengan evidencia clara de ese tema en título, resumen, tags o metadata.',
    'Si no hay entradas relevantes para el tema pedido, responde claramente que no encontraste nada cargado sobre ese tema. No recomiendes películas, libros u otros items no relacionados.',
    'Si no hay suficiente información en el catálogo, decilo de forma directa y sugeri que cargue más datos o revise tags/géneros.',
    'No inventes entries que no estén en el catálogo. No sumes recomendaciones externas.',
    'No devuelvas JSON. No uses markdown complejo: parrafos cortos o bullets simples.',
    '',
    'Mensaje del usuario:',
    message,
    '',
    'Catálogo compacto del usuario:',
    JSON.stringify(catalog, null, 2),
  ].join('\n')
}

export async function answerCatalogAssistant(
  rawPayload: unknown,
  apiKey: string | undefined,
) {
  if (!apiKey) {
    throw new Error('Falta GROQ_API_KEY para usar el asistente.')
  }

  const parsedPayload = catalogAssistantRequestSchema.safeParse(rawPayload)

  if (!parsedPayload.success) {
    throw new CatalogAssistantVálidationError('El mensaje del asistente es inválido.')
  }

  if (!isCatalogScopedMessage(parsedPayload.data.message, parsedPayload.data.entries)) {
    return { answer: OUT_OF_SCOPE_ANSWER }
  }

  const platformUsageAnswer = answerPlatformUsageQuestion(parsedPayload.data.message)

  if (platformUsageAnswer) {
    return { answer: platformUsageAnswer }
  }

  const client = new Groq({
    apiKey,
    maxRetries: 1,
    timeout: 30000,
  })

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.35,
      messages: [
        {
          role: 'system',
          content:
            'Sos un asistente de biblioteca personal. Responde con criterio, sin inventar datos y usando el catálogo provisto.',
        },
        {
          role: 'user',
          content: buildPrompt(parsedPayload.data.message, parsedPayload.data.entries),
        },
      ],
    })

    const answer = cleanText(completion.choices[0]?.message?.content ?? '')

    if (!answer) {
      throw new CatalogAssistantUpstreamError('La IA no devolvió una respuesta útil.')
    }

    return { answer }
  } catch (error) {
    if (error instanceof CatalogAssistantUpstreamError) {
      throw error
    }

    throw new CatalogAssistantUpstreamError(
      error instanceof Error
        ? `La IA no pudo responder el chat. ${error.message}`
        : 'La IA no pudo responder el chat.',
    )
  }
}
