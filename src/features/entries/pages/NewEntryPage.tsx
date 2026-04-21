import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { analyzeEntry } from '@/features/ai/analyze-entry'
import { useAuth } from '@/features/auth/auth-context'
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
  const [analysisTags, setAnalysisTags] = useState<string[]>([])
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
    setAnalysisTags([])
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
    setAnalysisTags([])
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

    setPendingImages((currentImages) => {
      const nextImages = [
        ...currentImages,
        ...selectedFiles.map((file, index) => ({
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
          ? 'Imagen pegada. Ahora puedes analizarla.'
          : `${imageFiles.length} imagenes pegadas. Ahora puedes analizarlas.`,
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

      return reindexImages(
        currentImages.filter((image) => image.id !== imageId),
      )
    })

    resetAnalysisState()
  }

  async function handleAnalyze() {
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
    setAnalysisTags([])

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
    setFormDefaults(
      getEntryFormValuesFromAnalysis(null, nextCombinedExtractedText),
    )

    if (imagesForAnalysis.length === 0) {
      setIsAnalyzing(false)
      setAnalysisErrorMessage(
        'No pudimos preparar ninguna imagen para analisis.',
      )
      return
    }

    try {
      const analysis = await analyzeEntry({
        combinedExtractedText: nextCombinedExtractedText,
        images: imagesForAnalysis,
        ocrTextByImage,
      })

      setFormDefaults(
        getEntryFormValuesFromAnalysis(analysis, nextCombinedExtractedText),
      )
      setAnalysisDetectedType(analysis.detectedType)
      setAnalysisConfidence(analysis.confidence)
      setAnalysisTags(analysis.tags)
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
        metadata: getEntryMetadataFromForm(values),
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
        getErrorMessage(
          error,
          'No pudimos guardar la entry y sus capturas.',
        ),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitDisabledReason =
    formDefaults.sourceType !== 'link' && pendingImages.length === 0
      ? 'Subi al menos una captura para continuar.'
      : null
  const canSubmitEntry =
    formDefaults.sourceType === 'link' || pendingImages.length > 0

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
          ? 'Imagen pegada. Ahora puedes analizarla.'
          : `${imageFiles.length} imagenes pegadas. Ahora puedes analizarlas.`,
      )
    }

    window.addEventListener('paste', handlePaste)

    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [])

  return (
    <section className="page">
      <div className="detail-back-row">
        <Link className="detail-back-link" to="/">
          <span aria-hidden="true">←</span>
          <span>Volver</span>
        </Link>
      </div>

      <div className="section-title">
        <h1>Agregar algo nuevo</h1>
        <p>
          Subi una o varias capturas de la misma cosa, deja que la IA proponga
          el registro y revisalo antes de guardarlo.
        </p>
      </div>

      <article className="card">
        <div className="card-section">
          <div className="section-title">
            <h2>1. Subi capturas</h2>
            <p>
              Pueden ser capturas o links de recetas, peliculas, series, libros, articulos, lugares, viajes, plantas, huerta o listas.
            </p>
            <p>Tambien puedes pegar una imagen desde el portapapeles.</p>
          </div>

          <div className="upload-actions">
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
              className="button"
              onClick={() => {
                inputRef.current?.click()
              }}
            >
              Elegir imagenes
            </button>
            <button
              type="button"
              className="button--ghost"
              disabled={pendingImages.length === 0 || isAnalyzing}
              onClick={() => {
                void handleAnalyze()
              }}
            >
              {isAnalyzing ? 'Analizando...' : 'Analizar con IA'}
            </button>
            <button
              type="button"
              className="button--ghost"
              disabled={isPastingImage}
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
          <div className="entry-form__actions">
            <button
              type="button"
              className="button--ghost"
              onClick={handleUseLink}
            >
              Usar link
            </button>
          </div>

          {linkSuccessMessage ? (
            <p className="feedback feedback--success">{linkSuccessMessage}</p>
          ) : null}
          {pasteSuccessMessage ? (
            <p className="feedback feedback--success">{pasteSuccessMessage}</p>
          ) : null}

          {pendingImages.length === 0 ? (
            <p className="muted">
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
                    <strong>
                      {image.position + 1}. {image.file.name}
                    </strong>
                    <span className={`capture-status capture-status--${image.ocrStatus}`}>
                      OCR: {image.ocrStatus}
                    </span>
                    {image.ocrErrorMessage ? (
                      <small className="form-error">{image.ocrErrorMessage}</small>
                    ) : image.ocrText ? (
                      <small className="muted">
                        {image.ocrText.slice(0, 140)}
                        {image.ocrText.length > 140 ? '...' : ''}
                      </small>
                    ) : (
                      <small className="muted">
                        Sin OCR todavia. Analiza para extraer texto.
                      </small>
                    )}
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
        </div>
      </article>

      <div className="card-grid card-grid--two">
        <article className="card" ref={formSectionRef}>
          <div className="section-title">
            <h2>2. Estado del analisis</h2>
            <p>
              Primero corre OCR por captura y despues la IA usa imagen + texto
              para proponerte un item listo para revisar.
            </p>
          </div>

          <div className="analysis-summary">
            <div className="field-card">
              <strong>Tipo sugerido</strong>
              <p>{analysisDetectedType ?? 'Sin sugerencia aun'}</p>
            </div>
            <div className="field-card">
              <strong>Confianza</strong>
              <p>
                {analysisConfidence !== null
                  ? `${Math.round(analysisConfidence * 100)}%`
                  : 'Sin calcular'}
              </p>
            </div>
            <div className="field-card">
              <strong>Tags sugeridos</strong>
              <p>{analysisTags.length > 0 ? analysisTags.join(', ') : 'Sin tags aun'}</p>
            </div>
          </div>

          {analysisErrorMessage ? (
            <p className="feedback feedback--error">{analysisErrorMessage}</p>
          ) : null}

          <label className="form-field">
            <span>Texto OCR consolidado</span>
            <textarea
              rows={10}
              value={combinedExtractedText}
              readOnly
              placeholder="Aca vas a ver el texto consolidado despues del analisis."
            />
          </label>
        </article>

        <article className="card">
          <div className="section-title">
            <h2>3. Revisa y guarda</h2>
            <p>
              La IA sugiere, vos decidis. Ajusta lo que haga falta y guardalo en
              tu archivo personal.
            </p>
          </div>

          <EntryForm
            defaultValues={formDefaults}
            isSubmitting={isSubmitting}
            submitLabel="Guardar en tu archivo"
            submitBusyLabel="Guardando..."
            canSubmit={canSubmitEntry}
            submitDisabledReason={submitDisabledReason}
            errorMessage={saveErrorMessage}
            successMessage={saveSuccessMessage}
            onSubmit={handleSave}
          />
        </article>
      </div>
    </section>
  )
}
