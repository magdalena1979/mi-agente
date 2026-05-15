import { supabase } from '@/integrations/supabase/client'

const ENTRY_DOCUMENTS_BUCKET = 'entry-images'
const PDF_MIME_TYPE = 'application/pdf'

export type StoredEntryDocument = {
  path: string
  name: string
  sizeBytes: number
  mimeType: string
  url: string | null
}

function getClient() {
  if (!supabase) {
    throw new Error(
      'Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
    )
  }

  return supabase
}

function sanitizeDocumentFileName(fileName: string) {
  const normalized = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const safeName = normalized || 'documento.pdf'

  return safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`
}

function buildEntryDocumentPath(userId: string, entryId: string, fileName: string) {
  return `${userId}/${entryId}/documents/original-${sanitizeDocumentFileName(fileName)}`
}

export async function uploadEntryDocument(
  entryId: string,
  userId: string,
  file: File,
): Promise<StoredEntryDocument> {
  const client = getClient()
  const storage = client.storage.from(ENTRY_DOCUMENTS_BUCKET)
  const documentPath = buildEntryDocumentPath(userId, entryId, file.name)
  const { error } = await storage.upload(documentPath, file, {
    upsert: true,
    contentType: PDF_MIME_TYPE,
  })

  if (error) {
    throw error
  }

  return {
    path: documentPath,
    name: file.name,
    sizeBytes: file.size,
    mimeType: PDF_MIME_TYPE,
    url: await getEntryDocumentUrl(documentPath),
  }
}

export async function getEntryDocumentUrl(documentPath?: string | null) {
  if (!documentPath) {
    return null
  }

  const client = getClient()
  const { data, error } = await client.storage
    .from(ENTRY_DOCUMENTS_BUCKET)
    .createSignedUrl(documentPath, 60 * 60)

  if (error || !data?.signedUrl) {
    return null
  }

  return data.signedUrl
}
