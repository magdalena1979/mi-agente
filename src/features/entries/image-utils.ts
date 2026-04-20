type ResizeOptions = {
  maxSide?: number
  quality?: number
}

function getPreferredMimeType(file: File) {
  if (file.type === 'image/png' || file.type === 'image/webp') {
    return file.type
  }

  return 'image/jpeg'
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
      reject(new Error(`No pudimos abrir la imagen ${file.name}.`))
    }

    image.src = objectUrl
  })
}

export async function createAnalysisImageDataUrl(
  file: File,
  options: ResizeOptions = {},
) {
  const { maxSide = 1400, quality = 0.82 } = options
  const image = await loadImageElement(file)
  const dimensions = getScaledDimensions(image.width, image.height, maxSide)
  const canvas = document.createElement('canvas')

  canvas.width = dimensions.width
  canvas.height = dimensions.height

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('No pudimos preparar la imagen para IA.')
  }

  context.drawImage(image, 0, 0, dimensions.width, dimensions.height)

  return canvas.toDataURL(getPreferredMimeType(file), quality)
}

export function sanitizeStorageFileName(fileName: string) {
  const normalized = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'capture'
}
