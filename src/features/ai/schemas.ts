import { z } from 'zod'

import { ENTRY_TYPES } from '../../types/entries'

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

export const aiAnalysisSchema = z
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

export const aiAnalysisImageSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
    position: z.number().int().min(0),
    dataUrl: z.string().startsWith('data:image/'),
  })
  .strict()

export const ocrTextByImageSchema = z
  .object({
    name: z.string().min(1),
    position: z.number().int().min(0),
    text: z.string(),
    status: z.enum(['success', 'error']),
    errorMessage: z.string().default(''),
  })
  .strict()

export const analyzeEntryRequestSchema = z
  .object({
    combinedExtractedText: z.string(),
    images: z.array(aiAnalysisImageSchema).min(1),
    ocrTextByImage: z.array(ocrTextByImageSchema).min(1),
  })
  .strict()

export type AiAnalysisInput = z.input<typeof aiAnalysisSchema>
export type AiAnalysis = z.infer<typeof aiAnalysisSchema>
export type AnalyzeEntryRequest = z.infer<typeof analyzeEntryRequestSchema>

export function normalizeAiAnalysis(payload: unknown) {
  return aiAnalysisSchema.parse(payload)
}

export function normalizeAnalyzeEntryRequest(payload: unknown) {
  return analyzeEntryRequestSchema.parse(payload)
}
