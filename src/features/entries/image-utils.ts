type ResizeOptions = {
  maxSide?: number
  quality?: number
  maxBytes?: number
}

function getPreferredMimeType() {
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
  const { maxSide = 1200, quality = 0.76, maxBytes = 1_200_000 } = options
  const image = await loadImageElement(file)
  const canvas = document.createElement('canvas')
  let currentMaxSide = maxSide
  let currentQuality = quality
  let dataUrl = ''

  while (true) {
    const dimensions = getScaledDimensions(
      image.width,
      image.height,
      currentMaxSide,
    )

    canvas.width = dimensions.width
    canvas.height = dimensions.height

    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('No pudimos preparar la imagen para IA.')
    }

    context.clearRect(0, 0, dimensions.width, dimensions.height)
    context.drawImage(image, 0, 0, dimensions.width, dimensions.height)
    dataUrl = canvas.toDataURL(getPreferredMimeType(), currentQuality)

    const estimatedBytes = Math.ceil((dataUrl.length * 3) / 4)

    if (
      estimatedBytes <= maxBytes ||
      (currentMaxSide <= 720 && currentQuality <= 0.55)
    ) {
      return dataUrl
    }

    if (currentQuality > 0.6) {
      currentQuality = Math.max(0.6, Number((currentQuality - 0.08).toFixed(2)))
      continue
    }

    currentMaxSide = Math.max(720, Math.round(currentMaxSide * 0.82))
  }
}

export function sanitizeStorageFileName(fileName: string) {
  const normalized = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'capture'
}
