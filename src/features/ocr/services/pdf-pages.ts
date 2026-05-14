import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export const MAX_PDF_PAGES_FOR_ANALYSIS = 2
const MAX_RENDER_PIXELS = 1_600_000
const MAX_PDF_SIZE_BYTES = 8 * 1024 * 1024
const PDF_IMAGE_QUALITY = 0.82
let pdfjsModulePromise: Promise<typeof import('pdfjs-dist')> | null = null

type RenderedPdfPages = {
  files: File[]
  totalPages: number
  renderedPages: number
}

function stripPdfExtension(fileName: string) {
  return fileName.replace(/\.pdf$/i, '').trim() || 'documento'
}

function getPdfRenderScale(width: number, height: number) {
  const scaleForPixels = Math.sqrt(MAX_RENDER_PIXELS / (width * height))

  return Math.min(2, Math.max(1, scaleForPixels))
}

function canvasToJpegBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No pudimos convertir una página del PDF a imagen.'))
          return
        }

        resolve(blob)
      },
      'image/jpeg',
      PDF_IMAGE_QUALITY,
    )
  })
}

async function loadPdfjs() {
  pdfjsModulePromise ??= import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

    return pdfjs
  })

  return pdfjsModulePromise
}

export function isPdfFile(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export async function renderPdfFileToImageFiles(
  file: File,
  maxPages = MAX_PDF_PAGES_FOR_ANALYSIS,
): Promise<RenderedPdfPages> {
  if (!isPdfFile(file)) {
    throw new Error('El archivo seleccionado no parece ser un PDF.')
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    throw new Error('El PDF es demasiado pesado. El límite para analizarlo es 8 MB.')
  }

  const pdfjs = await loadPdfjs()
  const pdfDocument = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useWorkerFetch: false,
  }).promise
  const totalPages = pdfDocument.numPages
  const pagesToRender = Math.min(totalPages, maxPages)
  const baseName = stripPdfExtension(file.name)
  const files: File[] = []

  try {
    for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber)
      const baseViewport = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({
        scale: getPdfRenderScale(baseViewport.width, baseViewport.height),
      })
      const canvas = window.document.createElement('canvas')
      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error('No pudimos preparar el PDF para lectura OCR.')
      }

      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)

      await page.render({
        canvasContext: context,
        viewport,
      }).promise

      const blob = await canvasToJpegBlob(canvas)
      files.push(
        new File([blob], `${baseName}-página-${pageNumber}.jpg`, {
          type: 'image/jpeg',
        }),
      )
      page.cleanup()
    }
  } finally {
    await pdfDocument.destroy()
  }

  return {
    files,
    totalPages,
    renderedPages: files.length,
  }
}
