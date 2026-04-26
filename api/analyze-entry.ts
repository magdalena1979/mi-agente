import type { VercelRequest, VercelResponse } from '@vercel/node'

import {
  analyzeEntryPayload,
  AnalyzeEntryUpstreamError,
  AnalyzeEntryValidationError,
  getAnalyzePayloadDebugSummary,
} from './_lib/analyze-entry'

function getRequestBody(req: VercelRequest) {
  if (typeof req.body === 'string') {
    return JSON.parse(req.body)
  }

  return req.body
}

function summarizeValueForLog(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > 280 ? `${value.slice(0, 280)}...` : value
  }

  if (Array.isArray(value)) {
    return {
      kind: 'array',
      length: value.length,
      sample: value.slice(0, 2).map((item) => summarizeValueForLog(item)),
    }
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        summarizeValueForLog(nestedValue),
      ]),
    )
  }

  return value
}

function getFilesSummary(req: VercelRequest) {
  const requestWithFiles = req as VercelRequest & {
    files?: unknown
    file?: unknown
  }

  return {
    files: summarizeValueForLog(requestWithFiles.files ?? null),
    file: summarizeValueForLog(requestWithFiles.file ?? null),
  }
}

function getErrorStatus(error: unknown) {
  if (error instanceof AnalyzeEntryValidationError) {
    return 400
  }

  if (error instanceof AnalyzeEntryUpstreamError) {
    return 502
  }

  if (error instanceof SyntaxError) {
    return 400
  }

  return 500
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const requestId = crypto.randomUUID()
  res.setHeader('x-request-id', requestId)

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({
      error: 'Method not allowed.',
    })
  }

  try {
    const requestBody = getRequestBody(req)
    const filesSummary = getFilesSummary(req)

    console.info('[analyze-entry] request', {
      requestId,
      contentLength: req.headers['content-length'] ?? null,
      contentType: req.headers['content-type'] ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      body: summarizeValueForLog(requestBody),
      ...filesSummary,
      payload: getAnalyzePayloadDebugSummary(requestBody),
    })

    const result = await analyzeEntryPayload(
      requestBody,
      process.env.GROQ_API_KEY,
    )

    return res.status(200).json(result)
  } catch (error) {
    const filesSummary = getFilesSummary(req)

    console.error('[analyze-entry] failed', {
      requestId,
      contentLength: req.headers['content-length'] ?? null,
      contentType: req.headers['content-type'] ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      body: summarizeValueForLog(req.body),
      ...filesSummary,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    })

    const message =
      error instanceof Error
        ? error.message
        : 'No pudimos analizar la entrada.'

    return res.status(getErrorStatus(error)).json({
      error: message,
      requestId,
    })
  }
}
