import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { analyzeEntry } from '@/features/ai/analyze-entry'
import { useAuth } from '@/features/auth/auth-context'
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
import { createAnalysisImageDataUrl } from '@/features/entries/image-utils'
import { extractTextFromImage } from '@/features/ocr/services/browser-ocr'
import type { PendingUploadImage } from '@/types/entries'

type OcrImageResult = {
  name: string
  position: number
  text: string
  status: 'success' | 'error'
  errorMessage: string
}

const MAX_ENTRY_CAPTURES = 2
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
  const formSectionRef = useRef<HTMLElement | null>(null)
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
  const [isAnalysisReviewModalOpen, setIsAnalysisReviewModalOpen] = useState(false)

  const typeLabel = entryTypeLabelMap[formDefaults.type] ?? 'Entrada'
  const heroHighlights = useMemo(
    () => getHeroHighlights(formDefaults, pendingImages, analysisConfidence),
    [analysisConfidence, formDefaults, pendingImages],
  )
  const heroTags = useMemo(() => parseTags(formDefaults.tagsText), [formDefaults.tagsText])
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
      ? 'Pega un link, completa la ficha y guardalo en tu archivo compartido.'
      : pendingImages.length > 0
        ? 'Subi hasta dos capturas, corre la IA y revisa la ficha antes de guardarla.'
        : 'Subi capturas o usa un link y arma una ficha con el mismo estilo visual del detalle.')

  useEffect(() => {
    previewUrlsRef.current = pendingImages.map((image) => image.previewUrl)
  }, [pendingImages])

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
    setIsAnalysisReviewModalOpen(false)
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
    setLinkSuccessMessage('Link listo. Completa los datos abajo y guarda la entrada.')
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
      formSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
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

    resetAnalysisState()
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
  }

  async function handleAnalyze() {
    if (analysisRunCount >= 2) {
      setAnalysisErrorMessage('Ya usaste los 2 analisis disponibles para esta entrada.')
      return
    }

    if (pendingImages.length === 0) {
      setAnalysisErrorMessage('Subi al menos una captura para analizar.')
      return
    }

    setIsAnalyzing(true)
    setAnalysisErrorMessage(null)
    setSaveErrorMessage(null)
    setSaveSuccessMessage(null)
    setAnalysisDetectedType(null)
    setAnalysisConfidence(null)

    const snapshot = [...pendingImages]
    const ocrTextByImage: OcrImageResult[] = []
    const imagesForAnalysis = []

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

      try {
        const dataUrl = await createAnalysisImageDataUrl(image.file)
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

    const nextCombinedExtractedText = ocrTextByImage
      .map((imageResult) => imageResult.text.trim())
      .filter(Boolean)
      .join('\n\n')

    setCombinedExtractedText(nextCombinedExtractedText)
    setFormDefaults(getEntryFormValuesFromAnalysis(null, nextCombinedExtractedText))

    if (imagesForAnalysis.length === 0) {
      setIsAnalyzing(false)
      setAnalysisErrorMessage('No pudimos preparar ninguna imagen para analisis.')
      return
    }

    try {
      const analysis = await analyzeEntry({
        combinedExtractedText: nextCombinedExtractedText,
        images: imagesForAnalysis,
        ocrTextByImage,
      })

      setFormDefaults(getEntryFormValuesFromAnalysis(analysis, nextCombinedExtractedText))
      setAnalysisDetectedType(analysis.detectedType)
      setAnalysisConfidence(analysis.confidence)
      setAnalysisRunCount((currentCount) => currentCount + 1)
      setIsAnalysisReviewModalOpen(true)
    } catch (error) {
      setAnalysisErrorMessage(
        getErrorMessage(
          error,
          'No pudimos analizar las capturas con IA. Podes revisar y guardar manualmente.',
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
  const canAnalyzeWithAi = pendingImages.length > 0 && analysisRunCount < 2

  function handleOpenReviewStep() {
    setIsAnalysisReviewModalOpen(false)
    requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
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
    }

    window.addEventListener('paste', handlePaste)

    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [pendingImages.length])

  return (
    <section className="page page--detail">
      {isAnalysisReviewModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="analysis-review-title"
          >
            <div className="section-title">
              <h2 id="analysis-review-title">La IA termino el analisis</h2>
              <p>Chequea la info, editala si hace falta y despues guarda los cambios.</p>
            </div>

            <div className="entry-form__actions">
              <button
                type="button"
                className="button"
                onClick={handleOpenReviewStep}
              >
                Revisar y editar
              </button>
              <button
                type="button"
                className="button--ghost"
                onClick={() => {
                  setIsAnalysisReviewModalOpen(false)
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="detail-back-row">
        <Link className="detail-back-link" to="/">
          <span aria-hidden="true">&#8592;</span>
          <span>Volver</span>
        </Link>
      </div>

      <article className="detail-hero detail-hero--new-entry">
        {pendingImages[0]?.previewUrl ? (
          <div className="detail-hero__media">
            <img
              src={pendingImages[0].previewUrl}
              alt={`Captura ${pendingImages[0].position + 1}`}
              className="detail-hero__image"
            />
          </div>
        ) : (
          <div className="detail-hero__media detail-hero__media--placeholder">
            <div className="new-entry-placeholder">
              <strong>{formDefaults.sourceType === 'link' ? 'Link cargado' : 'Nueva entry'}</strong>
              <span>
                {formDefaults.sourceType === 'link'
                  ? 'Completa la ficha, revisa los datos y guardala.'
                  : 'Subi hasta dos capturas o pega un link para empezar.'}
              </span>
            </div>
          </div>
        )}

        <div className="detail-hero__content">
          <div className="detail-hero__toprow">
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

            <div className="detail-hero__top-actions">
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={handleFilesSelected}
              />
              <button
                type="button"
                className="button--ghost"
                disabled={pendingImages.length >= MAX_ENTRY_CAPTURES}
                onClick={() => {
                  inputRef.current?.click()
                }}
              >
                Elegir imagenes
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
          </div>

          <div className="detail-hero__inline-actions">
            <button
              type="button"
              className="button"
              disabled={!canAnalyzeWithAi || isAnalyzing}
              onClick={() => {
                void handleAnalyze()
              }}
            >
              {isAnalyzing
                ? 'Analizando...'
                : analysisRunCount >= 2
                  ? 'Limite de IA alcanzado'
                  : 'Analizar con IA'}
            </button>
            <button
              type="button"
              className="button--ghost"
              disabled={isPastingImage || pendingImages.length >= MAX_ENTRY_CAPTURES}
              onClick={() => {
                void handlePasteImageFromClipboard()
              }}
            >
              {isPastingImage ? 'Pegando...' : 'Pegar imagen'}
            </button>
            <span className="muted">{analysisRunCount}/2 analisis usados</span>
          </div>

          <h1>{heroTitle}</h1>
          {formDefaults.sourceName ? (
            <p className="detail-hero__source">Visto en {formDefaults.sourceName}</p>
          ) : null}
          <p className="detail-hero__summary">{heroSummary}</p>

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
        </div>
      </article>

      <article className="card">
        <div className="detail-card-header">
          <div className="section-title">
            <h2>Carga capturas o link</h2>
            <p>Podes usar hasta dos capturas de la misma cosa o pegar un link para armar esta ficha.</p>
          </div>

          <p className="muted new-entry-counts">
            {pendingImages.length}/{MAX_ENTRY_CAPTURES} capturas cargadas
          </p>
        </div>

        <div className="new-entry-toolbar">
          <button
            type="button"
            className="button--ghost"
            disabled={pendingImages.length >= MAX_ENTRY_CAPTURES}
            onClick={() => {
              inputRef.current?.click()
            }}
          >
            Elegir imagenes
          </button>
          <button
            type="button"
            className="button--ghost"
            disabled={isPastingImage || pendingImages.length >= MAX_ENTRY_CAPTURES}
            onClick={() => {
              void handlePasteImageFromClipboard()
            }}
          >
            {isPastingImage ? 'Pegando...' : 'Pegar imagen'}
          </button>
        </div>

        <p className="muted">
          Usa `Pegar imagen` o el atajo `Ctrl+V` despues de copiar una captura.
        </p>

        <div className="new-entry-link-row">
          <label className="form-field">
            <span>O pega un link</span>
            <input
              type="url"
              placeholder="https://..."
              value={linkInput}
              onChange={(event) => {
                setLinkInput(event.target.value)
              }}
            />
          </label>

          <div className="new-entry-link-actions">
            <button
              type="button"
              className="button--ghost"
              onClick={handleUseLink}
            >
              Usar link
            </button>
          </div>
        </div>

        {analysisErrorMessage ? (
          <p className="feedback feedback--error">{analysisErrorMessage}</p>
        ) : null}
        {linkSuccessMessage ? (
          <p className="feedback feedback--success">{linkSuccessMessage}</p>
        ) : null}
        {pasteSuccessMessage ? (
          <p className="feedback feedback--success">{pasteSuccessMessage}</p>
        ) : null}

        {pendingImages.length === 0 ? (
          <p className="muted">Todavia no hay capturas cargadas para esta entrada.</p>
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
      </article>

      <article className="card" ref={formSectionRef}>
        <div className="section-title">
          <h2>Editar item</h2>
          <p>La IA sugiere, vos revisas. Ajusta lo que haga falta y despues guardalo.</p>
        </div>

        <EntryForm
          formId="entry-new-form"
          defaultValues={formDefaults}
          isSubmitting={isSubmitting}
          submitLabel="Guardar en tu archivo"
          submitBusyLabel="Guardando..."
          canSubmit={canSubmitEntry}
          submitDisabledReason={submitDisabledReason}
          showActions={false}
          errorMessage={saveErrorMessage}
          successMessage={saveSuccessMessage}
          onSubmit={handleSave}
        />
      </article>
    </section>
  )
}
