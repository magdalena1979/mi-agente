import type { VercelRequest, VercelResponse } from '@vercel/node'

import {
  answerCatalogAssistant,
  CatalogAssistantUpstreamError,
  CatalogAssistantVálidationError,
} from './_lib/catalog-assistant.js'

function getRequestBody(req: VercelRequest) {
  if (typeof req.body === 'string') {
    return JSON.parse(req.body)
  }

  return req.body
}

function getErrorStatus(error: unknown) {
  if (error instanceof CatalogAssistantVálidationError) {
    return 400
  }

  if (error instanceof CatalogAssistantUpstreamError) {
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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({
      error: 'Method not allowed.',
    })
  }

  try {
    const result = await answerCatalogAssistant(
      getRequestBody(req),
      process.env.GROQ_API_KEY,
    )

    return res.status(200).json(result)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'No pudimos responder el chat.'

    return res.status(getErrorStatus(error)).json({
      error: message,
    })
  }
}
