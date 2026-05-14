import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { analyzeEntry } from '@/features/ai/analyze-entry'
import { useAuth } from '@/features/auth/auth-context'
import {
  createManyUserCategories,
  createUserCategory,
  deleteUserCategory,
  listUserCategories,
  replaceEntryCategories,
} from '@/features/categories/categories-api'
import { ManageUserCategoriesModal } from '@/features/categories/components/ManageUserCategoriesModal'
import { EntryForm } from '@/features/entries/components/EntryForm'
import { createEntry, updateEntry } from '@/features/entries/entries-api'
import { replaceEntryImages } from '@/features/entries/entry-images-api'
import {
  createEmptyEntryFormValues,
  getEntryFormValuesFromAnalysis,
  getEntryMetadataFromForm,
  parseTags,
  type EntryFormValues,
} from '@/features/entries/entry-form-schema'
import {
  createAnalysisImageDataUrl,
  getAnalysisImageResizeOptions,
  sanitizeStorageFileName,
} from '@/features/entries/image-utils'
import { extractTextFromImage } from '@/features/ocr/services/browser-ocr'
import {
  isPdfFile,
  MAX_PDF_PAGES_FOR_ANALYSIS,
  renderPdfFileToImageFiles,
} from '@/features/ocr/services/pdf-pages'
import { createClientUuid } from '@/lib/random-id'
import type { CategoryRecord } from '@/types/categories'
import { ENTRY_FIELD_KEYS, type PendingUploadImage } from '@/types/entries'

type OcrImageResult = {
  name: string
  position: number
  text: string
  status: 'success' | 'error'
  errorMessage: string
}

const MAX_ENTRY_CAPTURES = 2
const MAX_INITIAL_AI_ANALYSES = 1
type NewEntryStep = 1 | 2 | 3
type PendingDocument = {
  name: string
  size: number
  totalPages: number
  renderedPages: number
}

function reindexImages(images: PendingUploadImage[]) {
  return images.map((image, index) => ({
    ...image,
    position: index,
  }))
}

function uniqueCategoriesById(categories: CategoryRecord[]) {
  return [...new Map(categories.map((category) => [category.id, category])).values()]
    .sort((leftCategory, rightCategory) =>
      leftCategory.name.localeCompare(rightCategory.name),
    )
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function isValidUrl(value: string) {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function isInstagramLink(value: string) {
  try {
    const url = new URL(value)
    return url.hostname.replace(/^www\./, '').toLowerCase().includes('instagram.com')
  } catch {
    return false
  }
}

function looksLikeRecipeContent(value: string) {
  const normalizedValue = value.toLowerCase()

  return ['ingredientes', 'masa', 'horno', 'receta'].some((keyword) =>
    normalizedValue.includes(keyword),
  )
}

function inferSourceNameFromLink(link: string) {
  try {
    const url = new URL(link)
    const hostname = url.hostname.replace(/^www\./, '').toLowerCase()
    const pathname = url.pathname.toLowerCase()

    if (hostname.includes('instagram.com')) {
      if (pathname.startsWith('/reel/')) return 'Instagram Reel'
      if (pathname.startsWith('/stories/')) return 'Instagram Story'
      if (pathname.startsWith('/p/')) return 'Instagram Post'
      if (pathname.startsWith('/tv/')) return 'Instagram Video'

      return 'Instagram'
    }
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      if (pathname.startsWith('/shorts/')) return 'YouTube Short'
      return 'YouTube'
    }
    if (hostname.includes('tiktok.com')) return 'TikTok'
    if (hostname.includes('x.com') || hostname.includes('twitter.com')) return 'X'
    if (hostname.includes('netflix.com')) return 'Netflix'
    if (hostname.includes('spotify.com')) return 'Spotify'
    if (hostname.includes('pinterest.com')) return 'Pinterest'

    return hostname
  } catch {
    return ''
  }
}

function formatSourceTypeLabel(sourceType: EntryFormValues['sourceType']) {
  switch (sourceType) {
    case 'link':
      return 'Link'
    case 'pdf':
      return 'PDF'
    case 'manual':
      return 'Manual'
    default:
      return 'Captura'
  }
}

function hasGeneratedFormContent(values: EntryFormValues) {
  if (values.title.trim().length > 0 || values.summary.trim().length > 0) {
    return true
  }

  if (values.tagsText.trim().length > 0) {
    return true
  }

  return ENTRY_FIELD_KEYS.some((fieldKey) => values[fieldKey].trim().length > 0)
}

function getHeroHighlights(
  values: EntryFormValues,
  pendingImages: PendingUploadImage[],
  pendingDocument: PendingDocument | null,
  analysisConfidence: number | null,
) {
  const highlights: Array<{ label: string; value: string }> = []

  const pushIfPresent = (label: string, value?: string | null) => {
    const normalizedValue = value?.trim()

    if (!normalizedValue) {
      return
    }

    highlights.push({ label, value: normalizedValue })
  }

  pushIfPresent('Origen', formatSourceTypeLabel(values.sourceType))
  pushIfPresent('Fuente', values.sourceName)

  if (pendingImages.length > 0) {
    highlights.push({
      label: pendingDocument ? 'PDF' : 'Capturas',
      value: pendingDocument
        ? `${pendingDocument.renderedPages}/${pendingDocument.totalPages}`
        : `${pendingImages.length}/${MAX_ENTRY_CAPTURES}`,
    })
  }

  if (analysisConfidence !== null) {
    highlights.push({
      label: 'Confianza',
      value: `${Math.round(analysisConfidence * 100)}%`,
    })
  }

  switch (values.type) {
    case 'movie':
    case 'series':
      pushIfPresent('Plataforma', values.platform)
      pushIfPresent('Director', values.director)
      pushIfPresent('Género', values.genre)
      pushIfPresent('Año', values.year)
      break
    case 'book':
      pushIfPresent('Autor', values.author)
      pushIfPresent('Género', values.genre)
      break
    case 'event':
      pushIfPresent('Fecha', values.date)
      pushIfPresent('Hora', values.time)
      pushIfPresent('Lugar', values.location)
      break
    default:
      pushIfPresent('Tema', values.topic)
      pushIfPresent('Lugar', values.location)
      break
  }

  return highlights.slice(0, 6)
}

function normalizeTagKey(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function titleCaseTagName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function inferTagNamesFromValues(values: EntryFormValues) {
  const tags = parseTags(values.tagsText)
  const searchableText = [
    values.title,
    values.summary,
    values.tagsText,
    values.topic,
    values.genre,
    values.note,
    values.sourceName,
  ]
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (
    /\b(astrolog|carta natal|zodiaco|horoscop|ascendente|signo lunar)\b/.test(
      searchableText,
    )
  ) {
    return ['Astrologia']
  }

  if (/\b(diabetes|glucosa|insulina|glucemia)\b/.test(searchableText)) {
    return ['Diabetes']
  }

  const ignoredTagKeys = new Set([
    'instagram',
    'tiktok',
    'youtube',
    'link',
    'post',
    'otro',
    'otros',
    'captura',
    'guardar',
    'pendiente',
  ])
  const tagNames = tags
    .filter((tag) => {
      const normalizedTag = normalizeTagKey(tag)

      return normalizedTag.length > 2 && !ignoredTagKeys.has(normalizedTag)
    })
    .slice(0, 4)
    .map(titleCaseTagName)

  return [...new Set(tagNames)]
}

function buildGeneratedEntryExport(values: EntryFormValues) {
  return {
    exportedAt: new Date().toISOString(),
    type: values.type,
    title: values.title.trim(),
    summary: values.summary.trim(),
    source: {
      type: values.sourceType,
      name: values.sourceName.trim(),
      url: values.sourceUrl.trim(),
    },
    tags: parseTags(values.tagsText),
    extractedText: values.extractedText.trim(),
    metadata: getEntryMetadataFromForm(values),
  }
}

function downloadJsonFile(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = fileName
  link.click()
  URL.revokeObjectURL(objectUrl)
}

export function NewEntryPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const previewUrlsRef = useRef<string[]>([])
  const [linkInput, setLinkInput] = useState('')

  const [pendingImages, setPendingImages] = useState<PendingUploadImage[]>([])
  const [pendingDocument, setPendingDocument] = useState<PendingDocument | null>(null)
  const [draftEntryId, setDraftEntryId] = useState<string | null>(null)
  const [instagramPastedText, setInstagramPastedText] = useState('')
  const [isInstagramTextMode, setIsInstagramTextMode] = useState(false)
  const [formDefaults, setFormDefaults] = useState(() =>
    createEmptyEntryFormValues({
      sourceType: 'screenshot',
    }),
  )
  const [analysisConfidence, setAnalysisConfidence] = useState<number | null>(null)
  const [analysisRunCount, setAnalysisRunCount] = useState(0)
  const [analysisErrorMessage, setAnalysisErrorMessage] = useState<string | null>(
    null,
  )
  const [pasteSuccessMessage, setPasteSuccessMessage] = useState<string | null>(null)
  const [linkSuccessMessage, setLinkSuccessMessage] = useState<string | null>(null)
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null)
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isPreparingPdf, setIsPreparingPdf] = useState(false)
  const [isPastingImage, setIsPastingImage] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeStep, setActiveStep] = useState<NewEntryStep>(1)
  const [availableCategories, setAvailableCategories] = useState<CategoryRecord[]>([])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [isManageCategoriesModalOpen, setIsManageCategoriesModalOpen] = useState(false)

  const [categoryErrorMessage, setCategoryErrorMessage] = useState<string | null>(null)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)
  const normalizedLinkInput = linkInput.trim()
  const hasValidLinkInput = isValidUrl(normalizedLinkInput)

  const heroHighlights = useMemo(
    () =>
      getHeroHighlights(
        formDefaults,
        pendingImages,
        pendingDocument,
        analysisConfidence,
      ),
    [analysisConfidence, formDefaults, pendingDocument, pendingImages],
  )
  const heroTags = useMemo(() => {
    const selectedCategoryNames = availableCategories
      .filter((category) => selectedCategoryIds.includes(category.id))
      .map((category) => category.name)

    return selectedCategoryNames.length > 0
      ? selectedCategoryNames
      : parseTags(formDefaults.tagsText)
  }, [availableCategories, formDefaults.tagsText, selectedCategoryIds])
  const hasPreparedLink =
    formDefaults.sourceType === 'link' && formDefaults.sourceUrl.trim().length > 0
  const isInstagramPreparedLink = hasPreparedLink && isInstagramLink(formDefaults.sourceUrl)
  const isUsingImages = pendingImages.length > 0
  const isUsingPdf = pendingDocument !== null
  const isUsingLink = normalizedLinkInput.length > 0 || hasPreparedLink
  const hasSourceReady = pendingImages.length > 0 || hasPreparedLink || hasValidLinkInput
  const hasAnalysisResult = analysisRunCount > 0
  const normalizedInstagramPastedText = instagramPastedText.trim()
  const hasInstagramSupportInput =
    pendingImages.length > 0 || normalizedInstagramPastedText.length > 0
  const shouldSuggestRecipeExtraction =
    isInstagramPreparedLink && looksLikeRecipeContent(normalizedInstagramPastedText)
  const hasReviewContent =
    hasSourceReady ||
    formDefaults.title.trim().length > 0 ||
    formDefaults.summary.trim().length > 0
  const heroTitle =
    formDefaults.title.trim() ||
    (formDefaults.sourceType === 'link'
      ? 'Link listo para revisar'
      : formDefaults.sourceType === 'pdf'
        ? 'PDF listo para analizar'
      : pendingImages.length > 0
        ? 'Capturas listas para analizar'
        : 'Agregá una nueva entrada')
  const heroSummary =
    formDefaults.summary.trim() ||
    (formDefaults.sourceType === 'link'
      ? 'Pegá un link, deja que la IA cargue la ficha y revisala antes de guardarla.'
      : formDefaults.sourceType === 'pdf'
        ? ''
      : pendingImages.length > 0
        ? 'Subí hasta dos capturas, corre la IA y revisa la ficha antes de guardarla.'
        : 'Subí capturas, un PDF o usa un link y arma una ficha con el mismo estilo visual del detalle.')
  const canAccessStep2 = hasSourceReady
  const canAccessStep3 = hasAnalysisResult

  useEffect(() => {
    previewUrlsRef.current = pendingImages.map((image) => image.previewUrl)
  }, [pendingImages])

  useEffect(() => {
    if (!hasSourceReady && activeStep !== 1) {
      setActiveStep(1)
      return
    }

    if (activeStep === 2 && !canAccessStep2) {
      setActiveStep(1)
      return
    }

    if (activeStep === 3 && !canAccessStep3) {
      setActiveStep(canAccessStep2 ? 2 : 1)
      return
    }

  }, [activeStep, canAccessStep2, canAccessStep3, hasSourceReady])

  useEffect(() => {
    let ignore = false

    async function loadCategories() {
      if (!user) {
        return
      }

      try {
        const nextCategories = await listUserCategories(user.id)

        if (!ignore) {
          setAvailableCategories(nextCategories)
        }
      } catch (error) {
        if (!ignore) {
          setCategoryErrorMessage(
            getErrorMessage(error, 'No pudimos cargar tus tags.'),
          )
        }
      }
    }

    void loadCategories()

    return () => {
      ignore = true
    }
  }, [user])

  useEffect(() => {
    return () => {
      for (const previewUrl of previewUrlsRef.current) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [])

  function resetAnalysisState(overrides: Partial<EntryFormValues> = {}) {
    setInstagramPastedText('')
    setIsInstagramTextMode(false)
    setAnalysisConfidence(null)
    setAnalysisRunCount(0)
    setAnalysisErrorMessage(null)
    setPasteSuccessMessage(null)
    setLinkSuccessMessage(null)
    setSaveErrorMessage(null)
    setSaveSuccessMessage(null)
    setFormDefaults(
      createEmptyEntryFormValues({
        sourceType: 'screenshot',
        ...overrides,
      }),
    )
  }

  function handleUseLink(linkOverride?: string) {
    const normalizedLink = (linkOverride ?? linkInput).trim()

    if (!normalizedLink) {
      setAnalysisErrorMessage('Pegá un link valido para continuar.')
      setLinkSuccessMessage(null)
      return
    }

    try {
      new URL(normalizedLink)
    } catch {
      setAnalysisErrorMessage('Pegá un link valido para continuar.')
      setLinkSuccessMessage(null)
      return
    }

    setLinkInput(normalizedLink)
    setPendingImages([])
    setPendingDocument(null)
    setInstagramPastedText('')
    setIsInstagramTextMode(false)
    setAnalysisConfidence(null)
    setAnalysisRunCount(0)
    setAnalysisErrorMessage(null)
    setLinkSuccessMessage(
      isInstagramLink(normalizedLink)
        ? 'Link de Instagram listo. Elige como quieres cargar el contenido.'
        : 'Link listo. Ahora podés cargar datos con IA.',
    )
    setSaveErrorMessage(null)
    setSaveSuccessMessage(null)
    setFormDefaults(
      createEmptyEntryFormValues({
        sourceType: 'link',
        sourceName: inferSourceNameFromLink(normalizedLink),
        sourceUrl: normalizedLink,
      }),
    )

    requestAnimationFrame(() => {
      setActiveStep(2)
    })
  }

  function appendImageFiles(
    selectedFiles: File[],
    options: {
      sourceType?: EntryFormValues['sourceType']
      sourceName?: string
      keepPendingDocument?: boolean
      replaceExisting?: boolean
    } = {},
  ) {
    if (selectedFiles.length === 0) {
      return
    }

    const currentImageCount = options.replaceExisting ? 0 : pendingImages.length

    if (currentImageCount >= MAX_ENTRY_CAPTURES) {
      setAnalysisErrorMessage('Cada entry puede tener como máximo 2 capturas.')
      return
    }

    const availableSlots = MAX_ENTRY_CAPTURES - currentImageCount
    const filesToAppend = selectedFiles.slice(0, availableSlots)

    if (filesToAppend.length < selectedFiles.length) {
      setAnalysisErrorMessage('Solo podés guardar hasta 2 capturas por entry.')
    } else {
      setAnalysisErrorMessage(null)
    }

    setPendingImages((currentImages) => {
      if (options.replaceExisting) {
        for (const image of currentImages) {
          URL.revokeObjectURL(image.previewUrl)
        }
      }

      const baseImages = options.replaceExisting ? [] : currentImages
      const nextImages = [
        ...baseImages,
        ...filesToAppend.map((file, index) => ({
          id: createClientUuid(),
          file,
          previewUrl: URL.createObjectURL(file),
          position: baseImages.length + index,
          ocrText: '',
          ocrStatus: 'idle' as const,
          ocrErrorMessage: null,
        })),
      ]

      return reindexImages(nextImages)
    })

    if (!options.keepPendingDocument) {
      setPendingDocument(null)
    }

    setLinkInput('')
    setLinkSuccessMessage(null)
    if (isInstagramPreparedLink) {
      setAnalysisConfidence(null)
      setAnalysisRunCount(0)
      setAnalysisErrorMessage(null)
      setPasteSuccessMessage(null)
      setSaveErrorMessage(null)
      setSaveSuccessMessage(null)
    } else {
      resetAnalysisState({
        sourceType: options.sourceType ?? 'screenshot',
        sourceName: options.sourceName ?? '',
      })
    }
    setActiveStep(2)
  }

  function handleLinkInputChange(value: string) {
    setLinkInput(value)
    setAnalysisErrorMessage(null)
    setLinkSuccessMessage(null)

    const normalizedValue = value.trim()

    if (
      normalizedValue &&
      isValidUrl(normalizedValue) &&
      !isUsingImages &&
      formDefaults.sourceUrl.trim() !== normalizedValue
    ) {
      handleUseLink(normalizedValue)
    }
  }

  async function handlePasteImageFromClipboard() {
    if (
      typeof navigator === 'undefined' ||
      !('clipboard' in navigator) ||
      typeof navigator.clipboard.read !== 'function'
    ) {
      setAnalysisErrorMessage(
        'Tu navegador no permite pegar imágenes con boton. Prueba con Ctrl+V.',
      )
      return
    }

    setIsPastingImage(true)
    setAnalysisErrorMessage(null)

    try {
      const clipboardItems = await navigator.clipboard.read()
      const imageFiles: File[] = []

      for (const clipboardItem of clipboardItems) {
        const imageType = clipboardItem.types.find((type) =>
          type.startsWith('image/'),
        )

        if (!imageType) {
          continue
        }

        const blob = await clipboardItem.getType(imageType)
        imageFiles.push(
          new File([blob], `clipboard-${Date.now()}.${imageType.split('/')[1] || 'png'}`, {
            type: imageType,
          }),
        )
      }

      if (imageFiles.length === 0) {
        setAnalysisErrorMessage(
          'No encontramos una imagen en el portapapeles. Copiá una imagen y volvé a intentar.',
        )
        return
      }

      appendImageFiles(imageFiles)
      setPasteSuccessMessage(
        imageFiles.length === 1
          ? 'Imagen pegada. Ahora podés analizarla.'
          : `${imageFiles.length} imágenes pegadas. Ahora podés analizarlas.`,
      )
    } catch (error) {
      setAnalysisErrorMessage(
        getErrorMessage(
          error,
          'No pudimos leer una imagen del portapapeles. Probá con Ctrl+V.',
        ),
      )
    } finally {
      setIsPastingImage(false)
    }
  }

  async function handlePdfSelected(file: File) {
    setIsPreparingPdf(true)
    setAnalysisErrorMessage(null)
    setPasteSuccessMessage(null)
    setLinkSuccessMessage(null)
    setSaveErrorMessage(null)
    setSaveSuccessMessage(null)

    try {
      const renderedPdf = await renderPdfFileToImageFiles(
        file,
        MAX_PDF_PAGES_FOR_ANALYSIS,
      )

      if (renderedPdf.files.length === 0) {
        setAnalysisErrorMessage('No pudimos leer páginas del PDF seleccionado.')
        return
      }

      setPendingDocument({
        name: file.name,
        size: file.size,
        totalPages: renderedPdf.totalPages,
        renderedPages: renderedPdf.renderedPages,
      })
      appendImageFiles(renderedPdf.files, {
        sourceType: 'pdf',
        sourceName: `PDF: ${file.name}`,
        keepPendingDocument: true,
        replaceExisting: true,
      })
      setPasteSuccessMessage(
        renderedPdf.totalPages > renderedPdf.renderedPages
          ? `PDF listo. Vamos a analizar las primeras ${renderedPdf.renderedPages} páginas para cuidar datos y espacio.`
          : 'PDF listo. Ahora podés generar la ficha con IA/OCR.',
      )
    } catch (error) {
      setPendingDocument(null)
      setAnalysisErrorMessage(
        getErrorMessage(error, 'No pudimos preparar el PDF para OCR.'),
      )
    } finally {
      setIsPreparingPdf(false)
    }
  }

  function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? [])
    const pdfFiles = selectedFiles.filter(isPdfFile)
    const imageFiles = selectedFiles.filter((file) => file.type.startsWith('image/'))

    if (pdfFiles.length > 0) {
      if (imageFiles.length > 0 || pdfFiles.length > 1) {
        setAnalysisErrorMessage('Seleccioná un PDF o hasta dos capturas, no ambos a la vez.')
      }

      void handlePdfSelected(pdfFiles[0])
    } else {
      appendImageFiles(imageFiles)
    }

    if (event.target) {
      event.target.value = ''
    }
  }

  function handleRemoveImage(imageId: string) {
    const nextImageCount = pendingImages.filter((image) => image.id !== imageId).length

    setPendingImages((currentImages) => {
      const imageToRemove = currentImages.find((image) => image.id === imageId)

      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.previewUrl)
      }

      return reindexImages(currentImages.filter((image) => image.id !== imageId))
    })

    if (pendingDocument) {
      if (nextImageCount === 0) {
        setPendingDocument(null)
      } else {
        setPendingDocument({
          ...pendingDocument,
          renderedPages: nextImageCount,
        })
      }
    }

    if (isInstagramPreparedLink) {
      setAnalysisConfidence(null)
      setAnalysisRunCount(0)
      setAnalysisErrorMessage(null)
      setPasteSuccessMessage(null)
      setSaveErrorMessage(null)
      setSaveSuccessMessage(null)
    } else {
      resetAnalysisState()
    }

    if (pendingImages.length <= 1) {
      setActiveStep(1)
    }
  }

  function handleClearPendingDocument() {
    setPendingImages((currentImages) => {
      for (const image of currentImages) {
        URL.revokeObjectURL(image.previewUrl)
      }

      return []
    })
    setPendingDocument(null)
    resetAnalysisState()
    setActiveStep(1)
  }

  async function handleAnalyze() {
    if (isInstagramPreparedLink && !hasInstagramSupportInput) {
      setAnalysisErrorMessage(
        'Para links de Instagram, subí una captura o pegá el texto del post para continuar.',
      )
      return
    }

    if (analysisRunCount >= MAX_INITIAL_AI_ANALYSES) {
      setAnalysisErrorMessage(
        'Ya usaste el análisis inicial. Si necesitás corregirlo, guardá la entry y usá el último análisis desde editar.',
      )
      return
    }

    if (pendingImages.length === 0 && !hasPreparedLink) {
      setAnalysisErrorMessage('Subí una captura, un PDF o pegá un link para analizar.')
      return
    }

    setIsAnalyzing(true)
    setAnalysisErrorMessage(null)
    setSaveErrorMessage(null)
    setSaveSuccessMessage(null)
    setAnalysisConfidence(null)

    const snapshot = [...pendingImages]
    const sourceContext = {
      sourceType: hasPreparedLink
        ? 'link'
        : pendingDocument
          ? 'pdf'
          : 'screenshot',
      sourceName: formDefaults.sourceName,
      sourceUrl: formDefaults.sourceUrl,
    } as const
    const manualSupportText = normalizedInstagramPastedText
    const imagesSelectedForAi = snapshot
      .slice()
      .sort((leftImage, rightImage) => leftImage.position - rightImage.position)
      .slice(0, MAX_ENTRY_CAPTURES)
    const ocrTextByImage: OcrImageResult[] = []
    const imagesForAnalysis = []
    let nextCombinedExtractedText = manualSupportText

    if (snapshot.length > 0) {
      for (const image of snapshot) {
        setPendingImages((currentImages) =>
          currentImages.map((currentImage) =>
            currentImage.id === image.id
              ? {
                  ...currentImage,
                  ocrStatus: 'processing',
                  ocrErrorMessage: null,
                }
              : currentImage,
          ),
        )

        let ocrText = ''
        let ocrStatus: PendingUploadImage['ocrStatus'] = 'success'
        let ocrErrorMessage: string | null = null

        try {
          ocrText = await extractTextFromImage(image.file)
        } catch (error) {
          ocrStatus = 'error'
          ocrErrorMessage = getErrorMessage(
            error,
            `No pudimos leer texto de ${image.file.name}.`,
          )
        }

        if (imagesSelectedForAi.some((selectedImage) => selectedImage.id === image.id)) {
          try {
            const dataUrl = await createAnalysisImageDataUrl(
              image.file,
              getAnalysisImageResizeOptions('low-cost'),
            )

            imagesForAnalysis.push({
              name: image.file.name,
              type: image.file.type || 'image/jpeg',
              position: image.position,
              dataUrl,
            })
          } catch (error) {
            if (!ocrErrorMessage) {
              ocrErrorMessage = getErrorMessage(
                error,
                `No pudimos preparar ${image.file.name} para IA.`,
              )
            }

            if (!ocrText) {
              ocrStatus = 'error'
            }
          }
        }

        ocrTextByImage.push({
          name: image.file.name,
          position: image.position,
          text: ocrText,
          status: ocrStatus === 'success' ? 'success' : 'error',
          errorMessage: ocrErrorMessage ?? '',
        })

        setPendingImages((currentImages) =>
          currentImages.map((currentImage) =>
            currentImage.id === image.id
              ? {
                  ...currentImage,
                  ocrText,
                  ocrStatus,
                  ocrErrorMessage,
                }
              : currentImage,
          ),
        )
      }

      nextCombinedExtractedText = [
        ...[manualSupportText].filter(Boolean),
        ...ocrTextByImage
          .map((imageResult) => imageResult.text.trim())
          .filter(Boolean),
      ].join('\n\n')

      if (imagesForAnalysis.length === 0) {
        setIsAnalyzing(false)
        setAnalysisErrorMessage('No pudimos preparar ninguna imagen para análisis.')
        return
      }
    }

    setFormDefaults(
      getEntryFormValuesFromAnalysis(null, nextCombinedExtractedText, sourceContext),
    )

    try {
      const analysis = await analyzeEntry({
        combinedExtractedText: nextCombinedExtractedText,
        images: imagesForAnalysis,
        ocrTextByImage,
        sourceType: sourceContext.sourceType,
        sourceName: sourceContext.sourceName,
        sourceUrl: sourceContext.sourceUrl,
      })

      setAnalysisConfidence(analysis.confidence)
      setAnalysisRunCount((currentCount) => currentCount + 1)

      const nextFormValues = getEntryFormValuesFromAnalysis(
        analysis,
        nextCombinedExtractedText,
        sourceContext,
      )

      if (!hasGeneratedFormContent(nextFormValues)) {
        setAnalysisErrorMessage(
          'La IA terminó el análisis, pero no devolvió información suficiente para precargar la ficha. Probá con otra captura o revisá el link.',
        )
        return
      }

      setFormDefaults(nextFormValues)
      const inferredTagNames = inferTagNamesFromValues(nextFormValues)

      if (user && inferredTagNames.length > 0) {
        try {
          const tags = await createManyUserCategories({
            userId: user.id,
            names: inferredTagNames,
          })

          setAvailableCategories((currentCategories) =>
            uniqueCategoriesById([...currentCategories, ...tags]),
          )
          setSelectedCategoryIds((currentIds) => [
            ...new Set([...currentIds, ...tags.map((tag) => tag.id)]),
          ])
        } catch (categoryError) {
          setCategoryErrorMessage(
            getErrorMessage(
              categoryError,
              'No pudimos crear los tags sugeridos automaticamente.',
            ),
          )
        }
      }

      setActiveStep(3)
    } catch (error) {
      setAnalysisErrorMessage(
        getErrorMessage(
          error,
          'No pudimos analizar esta entrada con IA. Podés revisar y guardar manualmente.',
        ),
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function handleSave(values: EntryFormValues) {
    if (!user) {
      return
    }

    const requiresImages = values.sourceType !== 'link'

    if (requiresImages && pendingImages.length === 0) {
      setSaveErrorMessage('Subí una captura o un PDF antes de guardar.')
      return
    }

    setIsSubmitting(true)
    setSaveErrorMessage(null)
    setSaveSuccessMessage(null)

    try {
      let categoryIdsForSave = selectedCategoryIds
      const inferredTagNames = inferTagNamesFromValues(values)

      if (categoryIdsForSave.length === 0 && inferredTagNames.length > 0) {
        const tags = await createManyUserCategories({
          userId: user.id,
          names: inferredTagNames,
        })

        categoryIdsForSave = tags.map((tag) => tag.id)
        setAvailableCategories((currentCategories) =>
          uniqueCategoriesById([...currentCategories, ...tags]),
        )
        setSelectedCategoryIds(categoryIdsForSave)
      }

      const entryPayload = {
        userId: user.id,
        type: values.type,
        title: values.title.trim(),
        summary: values.summary.trim(),
        sourceType: values.sourceType,
        sourceName: values.sourceName.trim() || null,
        sourceUrl: values.sourceUrl.trim() || null,
        status: values.status,
        aiTags: parseTags(values.tagsText),
        extractedText: values.extractedText.trim(),
        metadata: {
          ...getEntryMetadataFromForm(values),
          aiAnalysisCount: String(analysisRunCount),
        },
        uploaderName:
          typeof user.user_metadata?.full_name === 'string'
            ? user.user_metadata.full_name
            : typeof user.user_metadata?.name === 'string'
              ? user.user_metadata.name
              : null,
        uploaderEmail: user.email ?? null,
      }

      const entry = draftEntryId
        ? await updateEntry(draftEntryId, entryPayload)
        : await createEntry(entryPayload)

      if (!draftEntryId) {
        setDraftEntryId(entry.id)
      }

      if (pendingImages.length > 0) {
        await replaceEntryImages(entry.id, user.id, pendingImages)
      }

      await replaceEntryCategories({
        entryId: entry.id,
        userId: user.id,
        categoryIds: categoryIdsForSave,
      })

      setSaveSuccessMessage('Entry guardada correctamente.')
      navigate(`/entries/${entry.id}`, { replace: true })
    } catch (error) {
      setSaveErrorMessage(
        getErrorMessage(error, 'No pudimos guardar la entry y su material.'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleDownloadGeneratedData() {
    const fileBaseName =
      sanitizeStorageFileName(formDefaults.title || pendingDocument?.name || 'entry') ||
      'entry'

    downloadJsonFile(
      `${fileBaseName}-datos-generados.json`,
      buildGeneratedEntryExport(formDefaults),
    )
  }

  const submitDisabledReason =
    formDefaults.sourceType !== 'link' && pendingImages.length === 0
      ? 'Subí una captura o un PDF para continuar.'
      : null
  const canSubmitEntry = formDefaults.sourceType === 'link' || pendingImages.length > 0
  const canAnalyzeWithAi = hasSourceReady && analysisRunCount < MAX_INITIAL_AI_ANALYSES
  const captureProgressLabel = pendingDocument
    ? `${pendingDocument.renderedPages} de ${pendingDocument.totalPages} paginas PDF listas`
    : `${pendingImages.length} de ${MAX_ENTRY_CAPTURES} capturas cargadas`
  const isUploadDisabled = isPreparingPdf || pendingImages.length >= MAX_ENTRY_CAPTURES || isUsingLink
  const uploadCtaLabel =
    isPreparingPdf
      ? 'Preparando PDF'
      : pendingDocument
        ? 'PDF cargado'
        : pendingImages.length === 0
      ? 'Cargar primera captura'
      : pendingImages.length === 1
        ? 'Agregar segunda captura'
        : 'Capturas completas'
  const primaryPreviewUrl = pendingImages[0]?.previewUrl ?? null
  const stepItems: Array<{
    step: NewEntryStep
    title: string
    state: 'idle' | 'active' | 'done'
    disabled: boolean
  }> = [
    {
      step: 1,
      title: 'Carga',
      state: activeStep === 1 ? 'active' : hasSourceReady ? 'done' : 'idle',
      disabled: false,
    },
    {
      step: 2,
      title: 'IA',
      state: activeStep === 2 ? 'active' : hasAnalysisResult ? 'done' : canAccessStep2 ? 'idle' : 'idle',
      disabled: !canAccessStep2,
    },
    {
      step: 3,
      title: 'Guarda',
      state: activeStep === 3 ? 'active' : canAccessStep3 ? 'idle' : 'idle',
      disabled: !canAccessStep3,
    },
  ]

  function handleToggleCategory(categoryId: string) {
    setSelectedCategoryIds((currentIds) =>
      currentIds.includes(categoryId)
        ? currentIds.filter((currentId) => currentId !== categoryId)
        : [...currentIds, categoryId],
    )
  }

  async function handleCreateCategory(name: string) {
    if (!user) {
      return
    }

    setCategoryErrorMessage(null)

    try {
      const nextCategory = await createUserCategory({
        userId: user.id,
        name,
      })
      const nextCategories = await listUserCategories(user.id).catch(() => [])

      setAvailableCategories((currentCategories) =>
        uniqueCategoriesById(
          nextCategories.length > 0
            ? nextCategories
            : [...currentCategories, nextCategory],
        ),
      )
      setSelectedCategoryIds((currentIds) =>
        currentIds.includes(nextCategory.id)
          ? currentIds
          : [...currentIds, nextCategory.id],
      )
    } catch (error) {
      setCategoryErrorMessage(
        getErrorMessage(error, 'No pudimos guardar este tag.'),
      )
    }
  }

  async function handleDeleteCategory(category: CategoryRecord) {
    if (!user) {
      return
    }

    const confirmed = window.confirm(
      `Vas a quitar "${category.name}" de tus tags guardados.`,
    )

    if (!confirmed) {
      return
    }

    setDeletingCategoryId(category.id)
    setCategoryErrorMessage(null)

    try {
      await deleteUserCategory({
        userId: user.id,
        categoryId: category.id,
      })

      setAvailableCategories((currentCategories) =>
        currentCategories.filter((c) => c.id !== category.id),
      )
      setSelectedCategoryIds((currentIds) =>
        currentIds.filter((id) => id !== category.id),
      )
    } catch (error) {
      setCategoryErrorMessage(
        getErrorMessage(error, 'No se pudo eliminar el tag.'),
      )
    } finally {
      setDeletingCategoryId(null)
    }
  }

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const imageFiles = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file))

      if (imageFiles.length === 0) {
        return
      }

      event.preventDefault()
      appendImageFiles(imageFiles)
      setPasteSuccessMessage(
        imageFiles.length === 1
          ? 'Imagen pegada. Ahora podes analizarla.'
          : `${imageFiles.length} imagenes pegadas. Ahora podes analizarlas.`,
      )
      setActiveStep(2)
    }

    window.addEventListener('paste', handlePaste)

    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [pendingImages.length])

  function renderCapturePreviewGrid(options: { compact?: boolean; interactive?: boolean } = {}) {
    const { compact = false, interactive = true } = options
    const itemLabel = pendingDocument ? 'Página' : 'Captura'

    if (pendingImages.length === 0) {
      return null
    }

    return (
      <div className={compact ? 'capture-strip capture-strip--compact' : 'capture-strip'}>
        {pendingImages.map((image) => (
          <article className="capture-preview-card" key={image.id}>
            <img
              src={image.previewUrl}
              alt={`${itemLabel} ${image.position + 1}`}
              className="capture-preview-card__image"
            />
            <div className="capture-preview-card__shade" />
            <div className="capture-preview-card__content">
              <span className="capture-preview-card__badge">
                {itemLabel} {image.position + 1}
              </span>
              <strong>
                {image.ocrStatus === 'processing'
                  ? 'Generando ficha'
                  : pendingDocument
                    ? 'Página lista'
                    : 'Captura cargada'}
              </strong>
            </div>
            {interactive ? (
              <button
                type="button"
                className="capture-preview-card__remove"
                aria-label={`Quitar ${itemLabel.toLowerCase()} ${image.position + 1}`}
                onClick={() => {
                  handleRemoveImage(image.id)
                }}
              >
                Quitar
              </button>
            ) : null}
          </article>
        ))}

        {interactive && !pendingDocument && pendingImages.length < MAX_ENTRY_CAPTURES ? (
          <button
            type="button"
            className="capture-preview-card capture-preview-card--add"
            disabled={isUsingLink}
            onClick={() => {
              inputRef.current?.click()
            }}
          >
            <span className="capture-preview-card__plus">+</span>
            <strong>Agregar segunda captura</strong>
          </button>
        ) : null}
      </div>
    )
  }

  function renderInstagramLinkStep() {
    return (
      <article className="card new-entry-step-card">
        <div className="new-entry-step-card__header">
          <div className="section-title">
            <span className="eyebrow">Paso 2</span>
            <h2>Link de Instagram detectado</h2>
            <p>
              Instagram no permite leer automaticamente el contenido del post, pero podes
              cargarlo en segundos.
            </p>
          </div>

          <span className="muted">{analysisRunCount}/2 analisis usados</span>
        </div>

        <div className="instagram-link-guide">
          <article className="instagram-link-action">
            <div className="instagram-link-action__copy">
              <h3>Subír captura</h3>
              <p>Saca una captura del post y extraemos el contenido automaticamente.</p>
            </div>

            <button
              type="button"
              className="button"
              disabled={pendingImages.length >= MAX_ENTRY_CAPTURES}
              onClick={() => {
                inputRef.current?.click()
              }}
            >
              Subír captura
            </button>
          </article>

          <article className="instagram-link-action">
            <div className="instagram-link-action__copy">
              <h3>Pegar texto</h3>
              <p>Copia la descripcion del post y la analizamos.</p>
            </div>

            <button
              type="button"
              className="button--ghost"
              onClick={() => {
                setIsInstagramTextMode((currentValue) => !currentValue)
              }}
            >
              Pegar texto
            </button>
          </article>

          <article className="instagram-link-action">
            <div className="instagram-link-action__copy">
              <h3>Abrir en Instagram</h3>
              <p>Abrí el post en otra pestaña para copiar texto o sacar una captura.</p>
            </div>

            <a
              className="button--ghost"
              href={formDefaults.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir en Instagram
            </a>
          </article>
        </div>

        {isInstagramTextMode ? (
          <label className="form-field">
            <span>Texto del post</span>
            <textarea
              rows={5}
              placeholder="Pegá acá la descripción, ingredientes, pasos o cualquier texto del post."
              value={instagramPastedText}
              onChange={(event) => {
                setInstagramPastedText(event.target.value)
                setAnalysisErrorMessage(null)
              }}
            />
          </label>
        ) : null}

        {renderCapturePreviewGrid({ compact: true })}

        {hasInstagramSupportInput ? (
          <div className="new-entry-analysis-actions">
            <button
              type="button"
              className="button new-entry-analysis-actions__cta"
              disabled={isAnalyzing}
              onClick={() => {
                void handleAnalyze()
              }}
            >
              {isAnalyzing
                ? pendingImages.length > 0
                  ? 'Extrayendo contenido...'
                  : 'Analizando texto...'
                : pendingImages.length > 0
                  ? 'Extraer contenido automaticamente'
                  : shouldSuggestRecipeExtraction
                    ? 'Extraer receta automaticamente'
                    : 'Analizar texto pegado'}
            </button>
          </div>
        ) : null}

        {isAnalyzing ? (
          <div className="new-entry-analysis-status" role="status" aria-live="polite">
            <span className="new-entry-analysis-spinner" aria-hidden="true" />
            <div className="new-entry-analysis-status__copy">
              <strong>
                {pendingImages.length > 0
                  ? 'Analizando contenido con IA'
                  : 'Analizando texto con IA'}
              </strong>
              <p>OCR, deteccion y resumen trabajan juntos para armar la ficha.</p>
            </div>
          </div>
        ) : null}

        {analysisErrorMessage ? (
          <p className="feedback feedback--error">{analysisErrorMessage}</p>
        ) : null}

        <div className="new-entry-step-card__footer">
          <button
            type="button"
            className="button--ghost"
            disabled={isAnalyzing}
            onClick={() => {
              setActiveStep(1)
            }}
          >
            Volver
          </button>
          <button
            type="button"
            className="button"
            disabled={!hasAnalysisResult}
            onClick={() => {
              setActiveStep(3)
            }}
          >
            Seguir
          </button>
        </div>
      </article>
    )
  }

  return (
    <section className="page page--detail page--new-entry">
      <ManageUserCategoriesModal
        isOpen={isManageCategoriesModalOpen}
        categories={availableCategories}
        deletingCategoryId={deletingCategoryId}
        errorMessage={categoryErrorMessage}
        onClose={() => {
          setIsManageCategoriesModalOpen(false)
          setCategoryErrorMessage(null)
        }}
        onDelete={handleDeleteCategory}
        onCreate={handleCreateCategory}
      />

      <div className="detail-back-row">
        <Link className="detail-back-link" to="/">
          <span aria-hidden="true">&#8592;</span>
          <span>Volver</span>
        </Link>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="sr-only"
        onChange={handleFilesSelected}
      />

      <section className="new-entry-step-list" aria-label="Pasos para crear una entrada">
        {stepItems.map((step) => (
          <button
            key={step.step}
            type="button"
            className={`new-entry-step-badge new-entry-step-badge--${step.state}`}
            disabled={step.disabled}
            onClick={() => {
              if (!step.disabled) {
                if (step.step === 2 && !pendingImages.length && hasValidLinkInput && !hasPreparedLink) {
                  handleUseLink()
                  return
                }

                setActiveStep(step.step)
              }
            }}
          >
            <span>{step.step}</span>
            <strong>{step.title}</strong>
          </button>
        ))}
      </section>

      {activeStep === 1 ? (
      <article className="card new-entry-step-card new-entry-step-card--upload">
        <div className="new-entry-step-card__header">
          <div className="section-title">
            <span className="eyebrow">Paso 1</span>
            <h2>Guardá algo para encontrarlo después</h2>
            <p>Capturas, PDFs o links.</p>
          </div>

          <div className="new-entry-upload-meter" aria-label={captureProgressLabel}>
            <strong>{captureProgressLabel}</strong>
            <span>
              {Array.from({ length: MAX_ENTRY_CAPTURES }).map((_, index) => (
                <i
                  key={index}
                  className={
                    index < pendingImages.length
                      ? 'new-entry-upload-meter__dot new-entry-upload-meter__dot--filled'
                      : 'new-entry-upload-meter__dot'
                  }
                />
              ))}
            </span>
          </div>
        </div>

        <div className="new-entry-upload-stage">
          <div
            role="button"
            tabIndex={isUploadDisabled ? -1 : 0}
            aria-disabled={isUploadDisabled}
            className={
              pendingImages.length > 0
                ? 'new-entry-dropzone new-entry-dropzone--has-preview'
                : 'new-entry-dropzone'
            }
            onClick={() => {
              if (isUploadDisabled) {
                return
              }

              inputRef.current?.click()
            }}
            onKeyDown={(event) => {
              if (isUploadDisabled) {
                return
              }

              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                inputRef.current?.click()
              }
            }}
          >
            {primaryPreviewUrl ? (
              <img
                src={primaryPreviewUrl}
                alt={pendingDocument ? 'Preview de la primera pagina PDF' : 'Preview de la primera captura'}
                className="new-entry-dropzone__image"
              />
            ) : null}
            {pendingImages[0] ? (
              <span
                role="button"
                tabIndex={0}
                className="new-entry-dropzone__remove"
                aria-label={pendingDocument ? 'Quitar PDF' : 'Quitar primera captura'}
                onClick={(event) => {
                  event.stopPropagation()
                  if (pendingDocument) {
                    handleClearPendingDocument()
                    return
                  }

                  handleRemoveImage(pendingImages[0].id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    if (pendingDocument) {
                      handleClearPendingDocument()
                      return
                    }

                    handleRemoveImage(pendingImages[0].id)
                  }
                }}
              >
                {pendingDocument ? 'Quitar PDF' : 'Quitar captura'}
              </span>
            ) : null}
            <span className="new-entry-dropzone__overlay" />
            <span className="new-entry-dropzone__content">
              <span className="new-entry-dropzone__icon" aria-hidden="true" />
              <strong>Guardá una captura, PDF o link</strong>
              <small>
                {pendingImages.length > 0
                  ? pendingDocument
                    ? 'El PDF ya está convertido en páginas temporales. Podes continuar.'
                    : 'La captura ya está cargada. Podes sumar una más o continuar.'
                  : 'Arrastra, selecciona o pegá una captura, o elegí un PDF.'}
              </small>
            </span>
          </div>

          <div className="new-entry-toolbar">
            <button
              type="button"
              className="button"
              disabled={isUploadDisabled}
              onClick={() => {
                inputRef.current?.click()
              }}
            >
              <span className="new-entry-toolbar__label-desktop">{uploadCtaLabel}</span>
              <span className="new-entry-toolbar__label-mobile">{uploadCtaLabel}</span>
            </button>

            <button
              type="button"
              className="button--ghost new-entry-desktop-only"
              disabled={
                isPastingImage ||
                pendingImages.length >= MAX_ENTRY_CAPTURES ||
                isUsingLink ||
                isUsingPdf
              }
              onClick={() => {
                void handlePasteImageFromClipboard()
              }}
            >
              {isPastingImage ? 'Pegando...' : 'Pegar imagen'}
            </button>
          </div>
        </div>

        <p className="muted new-entry-desktop-only">
          Usa Pegar imagen o Ctrl+V después de copiar una captura. Los PDF se convierten en páginas temporales; el archivo original no se guarda.
        </p>

        <div className="new-entry-link-row">
          <div className="section-title">
            <h2>O pegá un link</h2>
          </div>

          <label className="form-field new-entry-link-input">
            <input
              type="url"
              placeholder="Pegá un link de Instagram, YouTube, TikTok, receta o artículo..."
              value={linkInput}
              disabled={isUsingImages}
              onChange={(event) => {
                handleLinkInputChange(event.target.value)
              }}
            />
          </label>

          <div className="new-entry-source-badges" aria-label="Fuentes compatibles">
            <span>JPG</span>
            <span>PNG</span>
            <span>PDF</span>
            <span>Instagram</span>
            <span>YouTube</span>
          </div>
        </div>

        {linkSuccessMessage ? (
          <p className="feedback feedback--success">{linkSuccessMessage}</p>
        ) : null}
        {pasteSuccessMessage ? (
          <p className="feedback feedback--success">{pasteSuccessMessage}</p>
        ) : null}

        {renderCapturePreviewGrid()}
        <div className="new-entry-step-card__footer">
          <button
            type="button"
            className="button"
            disabled={!hasSourceReady}
            onClick={() => {
              if (!pendingImages.length && hasValidLinkInput && !hasPreparedLink) {
                handleUseLink()
                return
              }

              setActiveStep(2)
            }}
          >
            Seguir
          </button>
        </div>
      </article>
      ) : null}

      {activeStep === 2 ? (
      isInstagramPreparedLink ? (
        renderInstagramLinkStep()
      ) : (
      <article className="card new-entry-step-card new-entry-step-card--analysis">
        <div className="new-entry-step-card__header">
          <div className="section-title">
            <span className="eyebrow">Paso 2</span>
            <h2>Analisis IA/OCR</h2>
            <p>Refind lee el contenido, detecta la plataforma y genera una ficha editable.</p>
          </div>

          <span className="muted">{analysisRunCount}/2 analisis usados</span>
        </div>

        {pendingImages.length > 0 ? renderCapturePreviewGrid({ compact: true }) : null}

        <div className="new-entry-analysis-actions">
          <button
            type="button"
            className="button new-entry-analysis-actions__cta"
            disabled={!canAnalyzeWithAi || isAnalyzing}
            onClick={() => {
              void handleAnalyze()
            }}
          >
            {isAnalyzing
              ? hasPreparedLink
                ? 'Generando ficha...'
                : 'Analizando contenido...'
                : analysisRunCount >= MAX_INITIAL_AI_ANALYSES
                ? 'Analisis inicial usado'
                : hasPreparedLink
                  ? 'Generar ficha automatica'
                  : 'Generar ficha automatica'}
          </button>
        </div>

        {isAnalyzing ? (
          <div className="new-entry-analysis-status" role="status" aria-live="polite">
            <span className="new-entry-analysis-spinner" aria-hidden="true" />
            <div className="new-entry-analysis-status__copy">
              <strong>
                {hasPreparedLink
                  ? 'Detectando informacion desde el link'
                  : pendingDocument
                    ? 'Leyendo el PDF con OCR e IA'
                    : 'Leyendo la captura con OCR e IA'}
              </strong>
              <p>Cuando termine, pasas directo a una ficha visual con los datos precargados.</p>
            </div>
          </div>
        ) : null}

        {analysisErrorMessage ? (
          <p className="feedback feedback--error">{analysisErrorMessage}</p>
        ) : null}
        <div className="new-entry-step-card__footer">
          <button
            type="button"
            className="button--ghost"
            disabled={isAnalyzing}
            onClick={() => {
              setActiveStep(1)
            }}
          >
            Volver
          </button>
          <button
            type="button"
            className="button"
            disabled={!hasAnalysisResult}
            onClick={() => {
              setActiveStep(3)
            }}
          >
            Seguir
          </button>
        </div>
      </article>
      )
      ) : null}

      {activeStep === 3 ? (
      <article className="card new-entry-step-card">
        {hasReviewContent ? (
          <div className="new-entry-review-card">
            <div className="new-entry-review-card__media" aria-hidden="true">
              {primaryPreviewUrl ? (
                <img src={primaryPreviewUrl} alt="" />
              ) : (
                <span />
              )}
            </div>

            <div className="detail-hero__eyebrow">
              <span className="detail-chip">{formatSourceTypeLabel(formDefaults.sourceType)}</span>
              {formDefaults.sourceName ? (
                <span className="detail-chip">{formDefaults.sourceName}</span>
              ) : null}
            </div>

            <div className="new-entry-review-card__copy">
              <h1>{heroTitle}</h1>
              {formDefaults.sourceName ? (
                <p className="detail-hero__source">Fuente detectada: {formDefaults.sourceName}</p>
              ) : null}
              <p className="detail-hero__summary">{heroSummary}</p>
            </div>

            {heroHighlights.length > 0 ? (
              <div className="detail-highlight-grid">
                {heroHighlights.map((fact) => (
                  <article
                    key={`${fact.label}-${fact.value}`}
                    className="detail-highlight-card"
                  >
                    <span>{fact.label}</span>
                    <strong>{fact.value}</strong>
                  </article>
                ))}
              </div>
            ) : null}

            {heroTags.length > 0 ? (
              <div className="detail-tag-row">
                {heroTags.map((tag) => (
                  <span key={tag} className="detail-chip">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            {pendingImages.length > 0 ? (
              <div className="new-entry-support-block">
                <div className="section-title new-entry-support-block__header">
                  <h3>{pendingDocument ? 'Paginas PDF' : 'Capturas cargadas'}</h3>
                  <p>
                    {pendingDocument
                      ? `${pendingDocument.name} convertido para IA/OCR sin guardar el PDF original.`
                      : 'Material visual usado por IA/OCR.'}
                  </p>
                </div>
                {renderCapturePreviewGrid({ compact: true, interactive: false })}
              </div>
            ) : null}
          </div>
        ) : null}

        <EntryForm
          formId="entry-new-form"
          defaultValues={formDefaults}
          isSubmitting={isSubmitting}
          submitLabel="Guardar en tu archivo"
          submitBusyLabel="Guardando..."
          canSubmit={canSubmitEntry}
          submitDisabledReason={submitDisabledReason}
          showActions={false}
          isReadOnly={false}
          errorMessage={saveErrorMessage}
          successMessage={saveSuccessMessage}
          availableCategories={availableCategories}
          selectedCategoryIds={selectedCategoryIds}
          onToggleCategory={handleToggleCategory}
          onDeleteCategory={handleDeleteCategory}
          deletingCategoryId={deletingCategoryId}
          onOpenManageCategories={() => {
            setCategoryErrorMessage(null)
            setIsManageCategoriesModalOpen(true)
          }}
          onSubmit={handleSave}
        />

        <div className="new-entry-step-card__footer">
          <button
            type="button"
            className="button--ghost"
            onClick={() => {
              setActiveStep(2)
            }}
          >
            Volver
          </button>
          <button
            type="button"
            className="button--ghost"
            disabled={!hasGeneratedFormContent(formDefaults)}
            onClick={handleDownloadGeneratedData}
          >
            Descargar datos
          </button>
          <button
            type="submit"
            form="entry-new-form"
            className="button"
            disabled={isSubmitting || !canSubmitEntry}
          >
            {isSubmitting ? 'Guardando...' : 'Guardar en tu archivo'}
          </button>
        </div>
      </article>
      ) : null}
    </section>
  )
}
