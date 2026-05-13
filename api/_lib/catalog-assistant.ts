import Groq from 'groq-sdk'
import { z } from 'zod'

const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'
const MAX_CATALOG_ITEMS = 90

export class CatalogAssistantValidationError extends Error {}
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
    'Sos el asistente conversacional de Refind, una biblioteca personal de capturas, links, peliculas, libros, recetas, lugares y notas.',
    'Responde siempre en espanol claro, formal, neutral y util.',
    'No uses muletillas ni vocativos coloquiales como "che", "bolu", "genia", "amiga", "de una" o similares.',
    'No fuerces tono simpatico: prioriza precision, sobriedad y claridad.',
    'Usa el catalogo del usuario como fuente principal. Si recomendas algo, prioriza items ya guardados.',
    'Si la persona pide algo como "que peli drama puedo ver", busca peliculas o series con genero, tags, resumen o nota compatible, y da 2 a 5 opciones con una razon corta.',
    'Si pide "que libros cargue ultimamente", ordena por updatedAt y menciona los libros mas recientes.',
    'Si pregunta por un tema, condicion o tag especifico, por ejemplo diabetes, astrologia, Cannes o drama, solo responde con entradas que contengan evidencia clara de ese tema en titulo, resumen, tags o metadata.',
    'Si no hay entradas relevantes para el tema pedido, responde claramente que no encontraste nada cargado sobre ese tema. No recomiendes peliculas, libros u otros items no relacionados.',
    'Si no hay suficiente informacion en el catalogo, decilo de forma directa y sugeri que cargue mas datos o revise tags/generos.',
    'No inventes entries que no esten en el catalogo. Si queres sumar una recomendacion externa, separala explicitamente como "fuera de tu biblioteca".',
    'No devuelvas JSON. No uses markdown complejo: parrafos cortos o bullets simples.',
    '',
    'Mensaje del usuario:',
    message,
    '',
    'Catalogo compacto del usuario:',
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
    throw new CatalogAssistantValidationError('El mensaje del asistente es invalido.')
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
            'Sos un asistente de biblioteca personal. Responde con criterio, sin inventar datos y usando el catalogo provisto.',
        },
        {
          role: 'user',
          content: buildPrompt(parsedPayload.data.message, parsedPayload.data.entries),
        },
      ],
    })

    const answer = cleanText(completion.choices[0]?.message?.content ?? '')

    if (!answer) {
      throw new CatalogAssistantUpstreamError('La IA no devolvio una respuesta util.')
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
