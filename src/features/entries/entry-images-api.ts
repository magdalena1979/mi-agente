import { supabase } from '@/integrations/supabase/client'
import type { EntryImageRecord, PendingUploadImage } from '@/types/entries'

type EntryImageRow = {
  id: string
  entry_id: string
  image_path: string
  image_url: string | null
  thumbnail_path?: string | null
  thumbnail_url?: string | null
  position: number
  ocr_text: string
  created_at: string
  original_width?: number | null
  original_height?: number | null
  thumbnail_width?: number | null
  thumbnail_height?: number | null
  original_size_bytes?: number | null
  thumbnail_size_bytes?: number | null
  mime_type?: string | null
}

const ENTRY_IMAGES_BUCKET = 'entry-images'
const ORIGINAL_MAX_SIDE = 1600
const ORIGINAL_QUALITY = 0.8
const THUMBNAIL_WIDTH = 640
const THUMBNAIL_HEIGHT = 360
const THUMBNAIL_QUALITY = 0.66
const WEBP_MIME_TYPE = 'image/webp'

function getClient() {
  if (!supabase) {
    throw new Error(
      'Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
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
    thumbnailPath: row.thumbnail_path ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    position: row.position,
    ocrText: row.ocr_text,
    createdAt: row.created_at,
    originalWidth: row.original_width ?? null,
    originalHeight: row.original_height ?? null,
    thumbnailWidth: row.thumbnail_width ?? null,
    thumbnailHeight: row.thumbnail_height ?? null,
    originalSizeBytes: row.original_size_bytes ?? null,
    thumbnailSizeBytes: row.thumbnail_size_bytes ?? null,
    mimeType: row.mime_type ?? null,
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

function stripImageExtension(fileName: string) {
  return sanitizeStorageFileName(fileName).replace(/\.[a-z0-9]+$/i, '')
}

function buildEntryImagePath(
  userId: string,
  entryId: string,
  image: PendingUploadImage,
  variant: 'original' | 'thumbnail',
) {
  const safeName = stripImageExtension(image.file.name)
  const paddedPosition = String(image.position + 1).padStart(3, '0')

  return `${userId}/${entryId}/${variant}/${paddedPosition}-${safeName}.webp`
}

function getStorageUploadErrorMessage(
  error: { message?: string } | null,
  imagePath: string,
) {
  const message = error?.message ?? 'No pudimos subír la imagen al bucket.'

  if (message.toLowerCase().includes('row-level security policy')) {
    return [
      'Supabase Storage rechazo la subída por politicas de acceso.',
      'Aplica la migracion de storage/RLS y volve a intentar.',
      `Ruta intentada: ${imagePath}`,
    ].join(' ')
  }

  return message
}

function getScaledDimensions(width: number, height: number, maxSide: number) {
  if (Math.max(width, height) <= maxSide) {
    return { width, height }
  }

  if (width >= height) {
    return {
      width: maxSide,
      height: Math.round((height / width) * maxSide),
    }
  }

  return {
    width: Math.round((width / height) * maxSide),
    height: maxSide,
  }
}

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error(`No pudimos optimizar la imagen ${file.name}.`))
    }

    image.src = objectUrl
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No pudimos convertir la captura a WebP.'))
          return
        }

        resolve(blob)
      },
      WEBP_MIME_TYPE,
      quality,
    )
  })
}

function drawContainImage(
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('No pudimos preparar la captura.')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)

  return canvas
}

function drawCenteredThumbnail(image: HTMLImageElement) {
  const sourceRatio = image.width / image.height
  const targetRatio = THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT
  let sourceX = 0
  let sourceY = 0
  let sourceWidth = image.width
  let sourceHeight = image.height

  if (sourceRatio > targetRatio) {
    sourceWidth = Math.round(image.height * targetRatio)
    sourceX = Math.round((image.width - sourceWidth) / 2)
  } else {
    sourceHeight = Math.round(image.width / targetRatio)
    sourceY = Math.round((image.height - sourceHeight) / 2)
  }

  const canvas = document.createElement('canvas')
  canvas.width = THUMBNAIL_WIDTH
  canvas.height = THUMBNAIL_HEIGHT

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('No pudimos preparar la miniatura.')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    THUMBNAIL_WIDTH,
    THUMBNAIL_HEIGHT,
  )

  return canvas
}

async function createOptimizedImageFiles(image: PendingUploadImage) {
  const sourceImage = await loadImageElement(image.file)
  const originalDimensions = getScaledDimensions(
    sourceImage.width,
    sourceImage.height,
    ORIGINAL_MAX_SIDE,
  )
  const originalCanvas = drawContainImage(
    sourceImage,
    originalDimensions.width,
    originalDimensions.height,
  )
  const thumbnailCanvas = drawCenteredThumbnail(sourceImage)
  const originalBlob = await canvasToBlob(originalCanvas, ORIGINAL_QUALITY)
  const thumbnailBlob = await canvasToBlob(thumbnailCanvas, THUMBNAIL_QUALITY)

  return {
    originalBlob,
    thumbnailBlob,
    originalWidth: originalDimensions.width,
    originalHeight: originalDimensions.height,
    thumbnailWidth: THUMBNAIL_WIDTH,
    thumbnailHeight: THUMBNAIL_HEIGHT,
    originalSizeBytes: originalBlob.size,
    thumbnailSizeBytes: thumbnailBlob.size,
  }
}

function getSignedUrlMap(
  signedUrlData: Array<{ path: string | null; signedUrl: string | null }> | null,
) {
  return new Map(
    (signedUrlData ?? [])
      .filter(
        (item): item is { path: string; signedUrl: string } =>
          Boolean(item.path) && Boolean(item.signedUrl),
      )
      .map((item) => [item.path, item.signedUrl]),
  )
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
  const { data: existingData } = await client
    .from('entry_images')
    .select('*')
    .eq('entry_id', entryId)

  for (const image of sortedImages) {
    const imagePath = buildEntryImagePath(userId, entryId, image, 'original')
    const thumbnailPath = buildEntryImagePath(userId, entryId, image, 'thumbnail')
    const optimizedImage = await createOptimizedImageFiles(image)
    const { error: uploadError } = await storage.upload(imagePath, optimizedImage.originalBlob, {
      upsert: true,
      contentType: WEBP_MIME_TYPE,
    })

    if (uploadError) {
      throw new Error(getStorageUploadErrorMessage(uploadError, imagePath))
    }

    const { error: thumbnailUploadError } = await storage.upload(
      thumbnailPath,
      optimizedImage.thumbnailBlob,
      {
        upsert: true,
        contentType: WEBP_MIME_TYPE,
      },
    )

    if (thumbnailUploadError) {
      throw new Error(getStorageUploadErrorMessage(thumbnailUploadError, thumbnailPath))
    }

    imageRows.push({
      entry_id: entryId,
      image_path: imagePath,
      image_url: null,
      thumbnail_path: thumbnailPath,
      thumbnail_url: null,
      position: image.position,
      ocr_text: image.ocrText,
      original_width: optimizedImage.originalWidth,
      original_height: optimizedImage.originalHeight,
      thumbnail_width: optimizedImage.thumbnailWidth,
      thumbnail_height: optimizedImage.thumbnailHeight,
      original_size_bytes: optimizedImage.originalSizeBytes,
      thumbnail_size_bytes: optimizedImage.thumbnailSizeBytes,
      mime_type: WEBP_MIME_TYPE,
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

  const nextPaths = new Set<string>(
    imageRows.flatMap((row) => [row.image_path, row.thumbnail_path]),
  )
  const stalePaths = ((existingData ?? []) as EntryImageRow[])
    .flatMap((row) => [row.image_path, row.thumbnail_path ?? null])
    .filter((path): path is string => Boolean(path))
    .filter((path) => !nextPaths.has(path))

  if (stalePaths.length > 0) {
    await storage.remove(stalePaths)
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

  const signedPaths = rows.flatMap((row) =>
    [row.imagePath, row.thumbnailPath].filter((path): path is string => Boolean(path)),
  )

  const { data: signedUrlData, error: signedUrlError } = await client.storage
    .from(ENTRY_IMAGES_BUCKET)
    .createSignedUrls(signedPaths, 60 * 60)

  if (signedUrlError || !signedUrlData) {
    return rows
  }

  const signedUrlMap = getSignedUrlMap(signedUrlData)

  return rows.map((row) => ({
    ...row,
    imageUrl: signedUrlMap.get(row.imagePath) ?? row.imageUrl,
    thumbnailUrl: row.thumbnailPath
      ? signedUrlMap.get(row.thumbnailPath) ?? row.thumbnailUrl
      : row.thumbnailUrl,
  }))
}

export async function listEntryImagesForEntries(entryIds: string[]) {
  if (entryIds.length === 0) {
    return []
  }

  const client = getClient()

  const { data, error } = await client
    .from('entry_images')
    .select('*')
    .in('entry_id', entryIds)
    .order('position', { ascending: true })

  if (error) {
    throw error
  }

  const rows = ((data ?? []) as EntryImageRow[]).map(mapEntryImageRow)

  if (rows.length === 0) {
    return rows
  }

  const thumbnailPaths = rows
    .map((row) => row.thumbnailPath)
    .filter((path): path is string => Boolean(path))

  if (thumbnailPaths.length === 0) {
    return rows.map((row) => ({
      ...row,
      imageUrl: null,
      thumbnailUrl: null,
    }))
  }

  const { data: signedUrlData, error: signedUrlError } = await client.storage
    .from(ENTRY_IMAGES_BUCKET)
    .createSignedUrls(thumbnailPaths, 60 * 60)

  if (signedUrlError || !signedUrlData) {
    return rows
  }

  const signedUrlMap = getSignedUrlMap(signedUrlData)

  return rows.map((row) => ({
    ...row,
    imageUrl: null,
    thumbnailUrl: row.thumbnailPath
      ? signedUrlMap.get(row.thumbnailPath) ?? row.thumbnailUrl
      : null,
  }))
}
