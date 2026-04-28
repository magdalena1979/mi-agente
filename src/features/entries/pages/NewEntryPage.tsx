import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { analyzeEntry } from '@/features/ai/analyze-entry'
import { useAuth } from '@/features/auth/auth-context'
import { findSuggestedCategoryForEntryType } from '@/features/categories/category-mapping'
import { createUserCategory, listUserCategories, replaceEntryUserCategories } from '@/features/categories/categories-api'
import { CreateUserCategoryModal } from '@/features/categories/components/CreateUserCategoryModal'
import { EntryForm } from '@/features/entries/components/EntryForm'
import { entryTypeOptions } from '@/features/entries/config/entry-type-config'
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
import type { UserCategoryRecord } from '@/types/categories'
import type { PendingUploadImage } from '@/types/entries'

type OcrImageResult = {
  name: string
  position: number
  text: string
  status: 'success' | 'error'
  errorMessage: string
}

const MAX_ENTRY_CAPTURES = 2
type NewEntryStep = 1 | 2 | 3
const entryTypeLabelMap = entryTypeOptions.reduce<Record<string, string>>(
  (labels, option) => {
    labels[option.type] = option.label
    return labels
  },
  {},
)

function reindexImages(images: PendingUploadImage[]) {
  return images.map((image, index) => ({
    ...image,
    position: index,
  }))
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

export function NewEntryPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const previewUrlsRef = useRef<string[]>([])
  const [linkInput, setLinkInput] = useState('')

  const [pendingImages, setPendingImages] = useState<PendingUploadImage[]>([])
  const [draftEntryId, setDraftEntryId] = useState<string | null>(null)
  const [combinedExtractedText, setCombinedExtractedText] = useState('')
  const [formDefaults, setFormDefaults] = useState(() =>
    createEmptyEntryFormValues({
      sourceType: 'screenshot',
    }),
  )
  const [analysisDetectedType, setAnalysisDetectedType] = useState<string | null>(null)
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
  const [availableCategories, setAvailableCategories] = useState<UserCategoryRecord[]>([])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [isCreateCategoryModalOpen, setIsCreateCategoryModalOpen] = useState(false)
  const [isSavingCategory, setIsSavingCategory] = useState(false)
  const [categoryErrorMessage, setCategoryErrorMessage] = useState<string | null>(null)
  const normalizedLinkInput = linkInput.trim()
  const hasValidLinkInput = isValidUrl(normalizedLinkInput)

  const typeLabel = entryTypeLabelMap[formDefaults.type] ?? 'Entrada'
  const suggestedCategory = useMemo(
    () => findSuggestedCategoryForEntryType(availableCategories, formDefaults.type),
    [availableCategories, formDefaults.type],
  )
  const heroHighlights = useMemo(
    () => getHeroHighlights(formDefaults, pendingImages, analysisConfidence),
    [analysisConfidence, formDefaults, pendingImages],
  )
  const heroTags = useMemo(() => parseTags(formDefaults.tagsText), [formDefaults.tagsText])
  const hasPreparedLink =
    formDefaults.sourceType === 'link' && formDefaults.sourceUrl.trim().length > 0
  const isUsingImages = pendingImages.length > 0
  const isUsingLink = normalizedLinkInput.length > 0 || hasPreparedLink
  const hasSourceReady = pendingImages.length > 0 || hasPreparedLink || hasValidLinkInput
  const hasAnalysisResult = analysisRunCount > 0
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
  const canAccessStep3 = hasSourceReady || hasAnalysisResult

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
            getErrorMessage(error, 'No pudimos cargar tus subcategorias personales.'),
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
    if (!suggestedCategory) {
      return
    }

    setSelectedCategoryIds((currentIds) =>
      currentIds.includes(suggestedCategory.id)
        ? currentIds
        : [suggestedCategory.id, ...currentIds],
    )
  }, [suggestedCategory])

  useEffect(() => {
    return () => {
      for (const previewUrl of previewUrlsRef.current) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [])

  function resetAnalysisState() {
    setCombinedExtractedText('')
    setAnalysisDetectedType(null)
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
    setCombinedExtractedText('')
    setAnalysisDetectedType(null)
    setAnalysisConfidence(null)
    setAnalysisRunCount(0)
    setAnalysisErrorMessage(null)
    setLinkSuccessMessage('Link listo. Ahora podes cargar datos con IA.')
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
          id: crypto.randomUUID(),
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
    resetAnalysisState()
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

    resetAnalysisState()

    if (pendingImages.length <= 1) {
      setActiveStep(1)
    }
  }

  async function handleAnalyze() {
    if (analysisRunCount >= 2) {
      setAnalysisErrorMessage('Ya usaste los 2 analisis disponibles para esta entrada.')
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
    setAnalysisDetectedType(null)
    setAnalysisConfidence(null)

    const snapshot = [...pendingImages]
    const sourceContext = {
      sourceType: hasPreparedLink ? 'link' : 'screenshot',
      sourceName: formDefaults.sourceName,
      sourceUrl: formDefaults.sourceUrl,
    } as const
    const imagesSelectedForAi = snapshot
      .slice()
      .sort((leftImage, rightImage) => leftImage.position - rightImage.position)
      .slice(0, 1)
    const ocrTextByImage: OcrImageResult[] = []
    const imagesForAnalysis = []
    let nextCombinedExtractedText = ''

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

      nextCombinedExtractedText = ocrTextByImage
        .map((imageResult) => imageResult.text.trim())
        .filter(Boolean)
        .join('\n\n')

      if (imagesForAnalysis.length === 0) {
        setIsAnalyzing(false)
        setAnalysisErrorMessage('No pudimos preparar ninguna imagen para analisis.')
        return
      }
    }

    setCombinedExtractedText(nextCombinedExtractedText)
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

      setFormDefaults(
        getEntryFormValuesFromAnalysis(
          analysis,
          nextCombinedExtractedText,
          sourceContext,
        ),
      )
      setAnalysisDetectedType(analysis.detectedType)
      setAnalysisConfidence(analysis.confidence)
      setAnalysisRunCount((currentCount) => currentCount + 1)
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

      await replaceEntryUserCategories({
        entryId: entry.id,
        userId: user.id,
        categoryIds: selectedCategoryIds,
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
  const canAnalyzeWithAi = hasSourceReady && analysisRunCount < 2
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

    setIsSavingCategory(true)
    setCategoryErrorMessage(null)

    try {
      const nextCategory = await createUserCategory({
        userId: user.id,
        name,
      })

      setAvailableCategories((currentCategories) =>
        [...currentCategories, nextCategory].sort((leftCategory, rightCategory) =>
          leftCategory.name.localeCompare(rightCategory.name),
        ),
      )
      setSelectedCategoryIds((currentIds) =>
        currentIds.includes(nextCategory.id) ? currentIds : [...currentIds, nextCategory.id],
      )
      setIsCreateCategoryModalOpen(false)
    } catch (error) {
      setCategoryErrorMessage(
        getErrorMessage(error, 'No pudimos guardar esta subcategoria personal.'),
      )
    } finally {
      setIsSavingCategory(false)
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

  return (
    <section className="page page--detail page--new-entry">
      <CreateUserCategoryModal
        isOpen={isCreateCategoryModalOpen}
        isSubmitting={isSavingCategory}
        errorMessage={categoryErrorMessage}
        onClose={() => {
          setIsCreateCategoryModalOpen(false)
          setCategoryErrorMessage(null)
        }}
        onSubmit={handleCreateCategory}
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
      <article className="card new-entry-step-card">
        <div className="new-entry-step-card__header">
          <div className="section-title">
            <span className="eyebrow">Paso 1</span>
            <h2>Carga una captura o un link</h2>
          </div>

          <p className="muted new-entry-counts new-entry-desktop-only">
            {pendingImages.length}/{MAX_ENTRY_CAPTURES} capturas cargadas
          </p>
        </div>

        <div className="new-entry-toolbar">
          <button
            type="button"
            className="button"
            disabled={pendingImages.length >= MAX_ENTRY_CAPTURES || isUsingLink}
            onClick={() => {
              inputRef.current?.click()
            }}
          >
            <span className="new-entry-toolbar__label-desktop">Elegir imagenes</span>
            <span className="new-entry-toolbar__label-mobile">
              Elegir imagenes ({MAX_ENTRY_CAPTURES})
            </span>
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

        <p className="muted new-entry-desktop-only">
          Usa `Pegar imagen` o el atajo `Ctrl+V` despues de copiar una captura.
        </p>

        <div className="new-entry-link-row">
          <label className="form-field">
            <span>O pega un link</span>
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

          <p className="muted new-entry-source-hint">
            Uno de los dos campos debe completarse para poder continuar. Puedes usar hasta 2
            imagenes o un solo link.
          </p>
        </div>

        {linkSuccessMessage ? (
          <p className="feedback feedback--success">{linkSuccessMessage}</p>
        ) : null}
        {pasteSuccessMessage ? (
          <p className="feedback feedback--success">{pasteSuccessMessage}</p>
        ) : null}

        {pendingImages.length === 0 ? (
          <p className="muted new-entry-desktop-only">
            Todavia no hay capturas cargadas para esta entrada.
          </p>
        ) : (
          <div className="capture-grid">
            {pendingImages.map((image) => (
              <article className="capture-card" key={image.id}>
                <img
                  src={image.previewUrl}
                  alt={`Captura ${image.position + 1}`}
                  className="capture-card__image"
                />
                <div className="capture-card__content">
                  <strong>Captura {image.position + 1}</strong>
                  <button
                    type="button"
                    className="button--ghost button--compact"
                    onClick={() => {
                      handleRemoveImage(image.id)
                    }}
                  >
                    Quitar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
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
      <article className="card new-entry-step-card new-entry-step-card--analysis">
        <div className="new-entry-step-card__header">
          <div className="section-title">
            <span className="eyebrow">Paso 2</span>
            <h2>Corre la IA</h2>
            <p>Cuando ya cargaste la captura, corre el análisis para que complete la ficha por vos.</p>
          </div>

          <span className="muted">{analysisRunCount}/2 analisis usados</span>
        </div>

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
              ? 'Cargando...'
              : analysisRunCount >= 2
                ? 'Limite de IA alcanzado'
                : 'Cargar datos'}
          </button>

        </div>

        {analysisErrorMessage ? (
          <p className="feedback feedback--error">{analysisErrorMessage}</p>
        ) : null}
        <div className="new-entry-step-card__footer">
          <button
            type="button"
            className="button--ghost"
            onClick={() => {
              setActiveStep(1)
            }}
          >
            Volver
          </button>
          <button
            type="button"
            className="button"
            disabled={!hasPreparedLink && !hasAnalysisResult}
            onClick={() => {
              setActiveStep(3)
            }}
          >
            {hasPreparedLink && !pendingImages.length ? 'Editar manualmente' : 'Seguir'}
          </button>
        </div>
      </article>
      ) : null}

      {activeStep === 3 ? (
      <article className="card new-entry-step-card">
        {hasReviewContent ? (
          <div className="new-entry-review-card">
            <div className="detail-hero__eyebrow">
              <span className="entry-card__type">
                {analysisDetectedType ? entryTypeLabelMap[analysisDetectedType] : typeLabel}
              </span>
              <span className="detail-chip">{formatSourceTypeLabel(formDefaults.sourceType)}</span>
              {combinedExtractedText ? <span className="detail-chip">OCR listo</span> : null}
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
              {suggestedCategory ? (
                <p className="detail-hero__source">
                  Categoria sugerida para filtrar: {suggestedCategory.name}
                </p>
              ) : null}
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
                  <p>Quedan abajo para revisar sin tapar la informacion principal.</p>
                </div>
                <div className="capture-grid capture-grid--compact">
                  {pendingImages.map((image) => (
                    <article className="capture-card" key={image.id}>
                      <img
                        src={image.previewUrl}
                        alt={`Captura ${image.position + 1}`}
                        className="capture-card__image"
                      />
                      <div className="capture-card__content">
                        <strong>Captura {image.position + 1}</strong>
                      </div>
                    </article>
                  ))}
                </div>
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
          onOpenCreateCategory={() => {
            setCategoryErrorMessage(null)
            setIsCreateCategoryModalOpen(true)
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
