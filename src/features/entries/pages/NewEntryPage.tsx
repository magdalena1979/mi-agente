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
} from '@/features/entries/image-utils'
import { extractTextFromImage } from '@/features/ocr/services/browser-ocr'
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
      label: 'Capturas',
      value: `${pendingImages.length}/${MAX_ENTRY_CAPTURES}`,
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
      pushIfPresent('Genero', values.genre)
      pushIfPresent('Ano', values.year)
      break
    case 'book':
      pushIfPresent('Autor', values.author)
      pushIfPresent('Genero', values.genre)
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

export function NewEntryPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const previewUrlsRef = useRef<string[]>([])
  const [linkInput, setLinkInput] = useState('')

  const [pendingImages, setPendingImages] = useState<PendingUploadImage[]>([])
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
    () => getHeroHighlights(formDefaults, pendingImages, analysisConfidence),
    [analysisConfidence, formDefaults, pendingImages],
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
      : pendingImages.length > 0
        ? 'Capturas listas para analizar'
        : 'Agrega una nueva entrada')
  const heroSummary =
    formDefaults.summary.trim() ||
    (formDefaults.sourceType === 'link'
      ? 'Pega un link, deja que la IA cargue la ficha y revisala antes de guardarla.'
      : pendingImages.length > 0
        ? 'Subi hasta dos capturas, corre la IA y revisa la ficha antes de guardarla.'
        : 'Subi capturas o usa un link y arma una ficha con el mismo estilo visual del detalle.')
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

  function resetAnalysisState() {
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
      }),
    )
  }

  function handleUseLink() {
    const normalizedLink = linkInput.trim()

    if (!normalizedLink) {
      setAnalysisErrorMessage('Pega un link valido para continuar.')
      setLinkSuccessMessage(null)
      return
    }

    try {
      new URL(normalizedLink)
    } catch {
      setAnalysisErrorMessage('Pega un link valido para continuar.')
      setLinkSuccessMessage(null)
      return
    }

    setPendingImages([])
    setInstagramPastedText('')
    setIsInstagramTextMode(false)
    setAnalysisConfidence(null)
    setAnalysisRunCount(0)
    setAnalysisErrorMessage(null)
    setLinkSuccessMessage(
      isInstagramLink(normalizedLink)
        ? 'Link de Instagram listo. Elige como quieres cargar el contenido.'
        : 'Link listo. Ahora podes cargar datos con IA.',
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

  function appendImageFiles(selectedFiles: File[]) {
    if (selectedFiles.length === 0) {
      return
    }

    if (pendingImages.length >= MAX_ENTRY_CAPTURES) {
      setAnalysisErrorMessage('Cada entry puede tener como maximo 2 capturas.')
      return
    }

    const availableSlots = MAX_ENTRY_CAPTURES - pendingImages.length
    const filesToAppend = selectedFiles.slice(0, availableSlots)

    if (filesToAppend.length < selectedFiles.length) {
      setAnalysisErrorMessage('Solo podes guardar hasta 2 capturas por entry.')
    } else {
      setAnalysisErrorMessage(null)
    }

    setPendingImages((currentImages) => {
      const nextImages = [
        ...currentImages,
        ...filesToAppend.map((file, index) => ({
          id: createClientUuid(),
          file,
          previewUrl: URL.createObjectURL(file),
          position: currentImages.length + index,
          ocrText: '',
          ocrStatus: 'idle' as const,
          ocrErrorMessage: null,
        })),
      ]

      return reindexImages(nextImages)
    })

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
      resetAnalysisState()
    }
    setActiveStep(2)
  }

  async function handlePasteImageFromClipboard() {
    if (
      typeof navigator === 'undefined' ||
      !('clipboard' in navigator) ||
      typeof navigator.clipboard.read !== 'function'
    ) {
      setAnalysisErrorMessage(
        'Tu navegador no permite pegar imagenes con boton. Prueba con Ctrl+V.',
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
          'No encontramos una imagen en el portapapeles. Copia una imagen y vuelve a intentar.',
        )
        return
      }

      appendImageFiles(imageFiles)
      setPasteSuccessMessage(
        imageFiles.length === 1
          ? 'Imagen pegada. Ahora podes analizarla.'
          : `${imageFiles.length} imagenes pegadas. Ahora podes analizarlas.`,
      )
    } catch (error) {
      setAnalysisErrorMessage(
        getErrorMessage(
          error,
          'No pudimos leer una imagen del portapapeles. Prueba con Ctrl+V.',
        ),
      )
    } finally {
      setIsPastingImage(false)
    }
  }

  function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith('image/'),
    )

    appendImageFiles(selectedFiles)

    if (event.target) {
      event.target.value = ''
    }
  }

  function handleRemoveImage(imageId: string) {
    setPendingImages((currentImages) => {
      const imageToRemove = currentImages.find((image) => image.id === imageId)

      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.previewUrl)
      }

      return reindexImages(currentImages.filter((image) => image.id !== imageId))
    })

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

  async function handleAnalyze() {
    if (isInstagramPreparedLink && !hasInstagramSupportInput) {
      setAnalysisErrorMessage(
        'Para links de Instagram, sube una captura o pega el texto del post para continuar.',
      )
      return
    }

    if (analysisRunCount >= MAX_INITIAL_AI_ANALYSES) {
      setAnalysisErrorMessage(
        'Ya usaste el analisis inicial. Si necesitas corregirlo, guarda la entry y usa el ultimo analisis desde editar.',
      )
      return
    }

    if (pendingImages.length === 0 && !hasPreparedLink) {
      setAnalysisErrorMessage('Subi al menos una captura o pega un link para analizar.')
      return
    }

    setIsAnalyzing(true)
    setAnalysisErrorMessage(null)
    setSaveErrorMessage(null)
    setSaveSuccessMessage(null)
    setAnalysisConfidence(null)

    const snapshot = [...pendingImages]
    const sourceContext = {
      sourceType: hasPreparedLink ? 'link' : 'screenshot',
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
        setAnalysisErrorMessage('No pudimos preparar ninguna imagen para analisis.')
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
          'La IA termino el analisis, pero no devolvio informacion suficiente para precargar la ficha. Prueba con otra captura o revisa el link.',
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
          'No pudimos analizar esta entrada con IA. Podes revisar y guardar manualmente.',
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
      setSaveErrorMessage('Subi al menos una captura antes de guardar.')
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
        getErrorMessage(error, 'No pudimos guardar la entry y sus capturas.'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitDisabledReason =
    formDefaults.sourceType !== 'link' && pendingImages.length === 0
      ? 'Subi al menos una captura para continuar.'
      : null
  const canSubmitEntry = formDefaults.sourceType === 'link' || pendingImages.length > 0
  const canAnalyzeWithAi = hasSourceReady && analysisRunCount < MAX_INITIAL_AI_ANALYSES
  const captureProgressLabel = `${pendingImages.length} de ${MAX_ENTRY_CAPTURES} capturas cargadas`
  const isUploadDisabled = pendingImages.length >= MAX_ENTRY_CAPTURES || isUsingLink
  const uploadCtaLabel =
    pendingImages.length === 0
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

    if (pendingImages.length === 0) {
      return null
    }

    return (
      <div className={compact ? 'capture-strip capture-strip--compact' : 'capture-strip'}>
        {pendingImages.map((image) => (
          <article className="capture-preview-card" key={image.id}>
            <img
              src={image.previewUrl}
              alt={`Captura ${image.position + 1}`}
              className="capture-preview-card__image"
            />
            <div className="capture-preview-card__shade" />
            <div className="capture-preview-card__content">
              <span className="capture-preview-card__badge">Captura {image.position + 1}</span>
              <strong>
                {image.ocrStatus === 'processing' ? 'Generando ficha' : 'Captura cargada'}
              </strong>
            </div>
            {interactive ? (
              <button
                type="button"
                className="capture-preview-card__remove"
                aria-label={`Quitar captura ${image.position + 1}`}
                onClick={() => {
                  handleRemoveImage(image.id)
                }}
              >
                Quitar
              </button>
            ) : null}
          </article>
        ))}

        {interactive && pendingImages.length < MAX_ENTRY_CAPTURES ? (
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
              <h3>Subir captura</h3>
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
              Subir captura
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
              <p>Abre el post en otra pestana para copiar texto o sacar una captura.</p>
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
              placeholder="Pega aqui la descripcion, ingredientes, pasos o cualquier texto del post."
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
        accept="image/*"
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
            <h2>Material visual</h2>
            <p>Subi hasta dos capturas. La preview aparece al instante y queda lista para IA/OCR.</p>
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
                alt="Preview de la primera captura"
                className="new-entry-dropzone__image"
              />
            ) : null}
            {pendingImages[0] ? (
              <span
                role="button"
                tabIndex={0}
                className="new-entry-dropzone__remove"
                aria-label="Quitar primera captura"
                onClick={(event) => {
                  event.stopPropagation()
                  handleRemoveImage(pendingImages[0].id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    handleRemoveImage(pendingImages[0].id)
                  }
                }}
              >
                Quitar captura
              </span>
            ) : null}
            <span className="new-entry-dropzone__overlay" />
            <span className="new-entry-dropzone__content">
              <span className="new-entry-dropzone__icon" aria-hidden="true" />
              <strong>{uploadCtaLabel}</strong>
              <small>
                {pendingImages.length > 0
                  ? 'La captura ya esta cargada. Podes sumar una mas o continuar.'
                  : 'Arrastra, selecciona o pega una captura desde el portapapeles.'}
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
              disabled={isPastingImage || pendingImages.length >= MAX_ENTRY_CAPTURES || isUsingLink}
              onClick={() => {
                void handlePasteImageFromClipboard()
              }}
            >
              {isPastingImage ? 'Pegando...' : 'Pegar imagen'}
            </button>
          </div>
        </div>

        <p className="muted new-entry-desktop-only">
          Usa Pegar imagen o Ctrl+V despues de copiar una captura.
        </p>

        <div className="new-entry-link-row">
          <div className="section-title">
            <h2>O pega un link</h2>
          </div>

          <label className="form-field">
            <span className="sr-only">O pega un link</span>
            <input
              type="url"
              placeholder="https://..."
              value={linkInput}
              disabled={isUsingImages}
              onChange={(event) => {
                setLinkInput(event.target.value)
              }}
            />
          </label>
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
                  <h3>Capturas cargadas</h3>
                  <p>Material visual usado por IA/OCR.</p>
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
