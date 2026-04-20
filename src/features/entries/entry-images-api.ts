import { supabase } from '@/integrations/supabase/client'
import type { EntryImageRecord, PendingUploadImage } from '@/types/entries'

type EntryImageRow = {
  id: string
  entry_id: string
  image_path: string
  image_url: string | null
  position: number
  ocr_text: string
  created_at: string
}

const ENTRY_IMAGES_BUCKET = 'entry-images'

function getClient() {
  if (!supabase) {
    throw new Error(
      'Supabase no esta configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
    )
  }

  return supabase
}

function mapEntryImageRow(row: EntryImageRow): EntryImageRecord {
  return {
    id: row.id,
    entryId: row.entry_id,
    imagePath: row.image_path,
    imageUrl: row.image_url,
    position: row.position,
    ocrText: row.ocr_text,
    createdAt: row.created_at,
  }
}

function sanitizeStorageFileName(fileName: string) {
  const normalized = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'capture'
}

function buildEntryImagePath(
  userId: string,
  entryId: string,
  image: PendingUploadImage,
) {
  const safeName = sanitizeStorageFileName(image.file.name)
  const paddedPosition = String(image.position + 1).padStart(3, '0')

  return `${userId}/${entryId}/${paddedPosition}-${safeName}`
}

function getStorageUploadErrorMessage(
  error: { message?: string } | null,
  imagePath: string,
) {
  const message = error?.message ?? 'No pudimos subir la imagen al bucket.'

  if (message.toLowerCase().includes('row-level security policy')) {
    return [
      'Supabase Storage rechazo la subida por politicas de acceso.',
      'Aplica la migracion de storage/RLS y volve a intentar.',
      `Ruta intentada: ${imagePath}`,
    ].join(' ')
  }

  return message
}

export async function replaceEntryImages(
  entryId: string,
  userId: string,
  images: PendingUploadImage[],
) {
  const client = getClient()
  const storage = client.storage.from(ENTRY_IMAGES_BUCKET)
  const sortedImages = [...images].sort((left, right) => left.position - right.position)

  const imageRows = []

  for (const image of sortedImages) {
    const imagePath = buildEntryImagePath(userId, entryId, image)
    const { error: uploadError } = await storage.upload(imagePath, image.file, {
      upsert: true,
      contentType: image.file.type || 'image/jpeg',
    })

    if (uploadError) {
      throw new Error(getStorageUploadErrorMessage(uploadError, imagePath))
    }

    imageRows.push({
      entry_id: entryId,
      image_path: imagePath,
      image_url: null,
      position: image.position,
      ocr_text: image.ocrText,
    })
  }

  const { error: deleteError } = await client
    .from('entry_images')
    .delete()
    .eq('entry_id', entryId)

  if (deleteError) {
    throw deleteError
  }

  const { error: insertError } = await client
    .from('entry_images')
    .insert(imageRows)

  if (insertError) {
    throw insertError
  }
}

export async function listEntryImages(entryId: string) {
  const client = getClient()

  const { data, error } = await client
    .from('entry_images')
    .select('*')
    .eq('entry_id', entryId)
    .order('position', { ascending: true })

  if (error) {
    throw error
  }

  const rows = ((data ?? []) as EntryImageRow[]).map(mapEntryImageRow)

  if (rows.length === 0) {
    return rows
  }

  const { data: signedUrlData, error: signedUrlError } = await client.storage
    .from(ENTRY_IMAGES_BUCKET)
    .createSignedUrls(
      rows.map((row) => row.imagePath),
      60 * 60,
    )

  if (signedUrlError || !signedUrlData) {
    return rows
  }

  const signedUrlMap = new Map(
    signedUrlData.map((item) => [item.path, item.signedUrl]),
  )

  return rows.map((row) => ({
    ...row,
    imageUrl: signedUrlMap.get(row.imagePath) ?? row.imageUrl,
  }))
}
