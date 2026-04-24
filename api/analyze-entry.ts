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

    console.info('[analyze-entry] request', {
      requestId,
      contentLength: req.headers['content-length'] ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      payload: getAnalyzePayloadDebugSummary(requestBody),
    })

    const result = await analyzeEntryPayload(
      requestBody,
      process.env.GROQ_API_KEY,
    )

    return res.status(200).json(result)
  } catch (error) {
    console.error('[analyze-entry] failed', {
      requestId,
      contentLength: req.headers['content-length'] ?? null,
      userAgent: req.headers['user-agent'] ?? null,
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
