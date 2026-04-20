import type { VercelRequest, VercelResponse } from '@vercel/node'

import { analyzeEntryPayload } from './_lib/analyze-entry'

function getRequestBody(req: VercelRequest) {
  if (typeof req.body === 'string') {
    return JSON.parse(req.body)
  }

  return req.body
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
    const result = await analyzeEntryPayload(
      getRequestBody(req),
      process.env.GROQ_API_KEY,
    )

    return res.status(200).json(result)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'No pudimos analizar la entrada.'

    return res.status(400).json({
      error: message,
    })
  }
}
