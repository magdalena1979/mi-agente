import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { analyzeEntry } from '@/features/ai/analyze-entry'
import { useAuth } from '@/features/auth/auth-context'
import { EntryForm } from '@/features/entries/components/EntryForm'
import {
  entryTypeOptions,
} from '@/features/entries/config/entry-type-config'
import {
  deleteEntry,
  getEntry,
  updateEntry,
} from '@/features/entries/entries-api'
import {
  listEntryImages,
  replaceEntryImages,
} from '@/features/entries/entry-images-api'
import {
  getEntryFormDefaultValues,
  getEntryMetadataFromForm,
  parseTags,
  type EntryFormValues,
} from '@/features/entries/entry-form-schema'
import { createAnalysisImageDataUrl } from '@/features/entries/image-utils'
import { extractTextFromImage } from '@/features/ocr/services/browser-ocr'
import type {
  EntryImageRecord,
  EntryRecord,
  EntryType,
  PendingUploadImage,
} from '@/types/entries'

const entryTypeLabelMap = entryTypeOptions.reduce<Record<EntryType, string>>(
  (labels, option) => {
    labels[option.type] = option.label
    return labels
  },
  {} as Record<EntryType, string>,
)

function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))
}

function getVisibleStatus(status: EntryRecord['status']) {
  return status === 'reviewed' ? 'reviewed' : 'draft'
}

function getAiRefreshCount(entry: EntryRecord) {
  const rawValue = (entry.metadata as Record<string, string | undefined>)[
    'aiRefreshCount'
  ]
  const parsedValue = Number.parseInt(rawValue ?? '0', 10)

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0
}

function buildMetadataWithAiRefreshCount(
  metadata: EntryRecord['metadata'],
  aiRefreshCount: number,
) {
  return {
    ...metadata,
    aiRefreshCount: String(aiRefreshCount),
  } as EntryRecord['metadata']
}

function getStorageFileName(imagePath: string, fallback: string) {
  const rawName = imagePath.split('/').pop() || fallback

  return rawName.replace(/^\d+-/, '')
}

function getHeroHighlights(entry: EntryRecord) {
  const highlights: Array<{ label: string; value: string }> = []

  const pushIfPresent = (label: string, value?: string | null) => {
    const normalizedValue = value?.trim()

    if (!normalizedValue) {
      return
    }

    highlights.push({ label, value: normalizedValue })
  }

  switch (entry.type) {
    case 'movie':
    case 'series':
      pushIfPresent('Director', entry.metadata.director)
      pushIfPresent('Plataforma', entry.metadata.platform)
      pushIfPresent('Genero', entry.metadata.genre)
      pushIfPresent('Ano', entry.metadata.year)
      pushIfPresent('Duracion', entry.metadata.duration)
      pushIfPresent('Reparto', entry.metadata.cast)
      break
    case 'book':
      pushIfPresent('Autor', entry.metadata.author)
      pushIfPresent('Genero', entry.metadata.genre)
      pushIfPresent('Ano', entry.metadata.year)
      break
    case 'event':
      pushIfPresent('Fecha', entry.metadata.date)
      pushIfPresent('Hora', entry.metadata.time)
      pushIfPresent('Lugar', entry.metadata.location)
      break
    case 'place':
    case 'trip':
      pushIfPresent('Lugar', entry.metadata.location)
      pushIfPresent('Fecha', entry.metadata.date)
      pushIfPresent('Plataforma', entry.metadata.platform)
      break
    case 'article':
      pushIfPresent('Fuente', entry.sourceName)
      pushIfPresent('Autor', entry.metadata.author)
      pushIfPresent('Tema', entry.metadata.topic)
      break
    case 'recipe':
      pushIfPresent('Fuente', entry.sourceName)
      pushIfPresent('Tema', entry.metadata.topic)
      break
    default:
      pushIfPresent('Fuente', entry.sourceName)
      pushIfPresent('Tema', entry.metadata.topic)
      pushIfPresent('Nota', entry.metadata.note)
      break
  }

  pushIfPresent('Subio', entry.uploaderName || entry.uploaderEmail)

  return highlights.slice(0, 6)
}

function BackLink() {
  return (
    <div className="detail-back-row">
      <Link className="detail-back-link" to="/">
        <span aria-hidden="true">←</span>
        <span>Volver</span>
      </Link>
    </div>
  )
}

export function EntryDetailPage() {
  const navigate = useNavigate()
  const { entryId } = useParams()
  const { user } = useAuth()
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [entry, setEntry] = useState<EntryRecord | null>(null)
  const [entryImages, setEntryImages] = useState<EntryImageRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isReanalyzing, setIsReanalyzing] = useState(false)
  const [isUploadingCaptures, setIsUploadingCaptures] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    async function loadEntry() {
      if (!user || !entryId) return

      setIsLoading(true)
      setErrorMessage(null)

      try {
        const [nextEntry, nextEntryImages] = await Promise.all([
          getEntry(entryId),
          listEntryImages(entryId),
        ])

        if (!ignore) {
          if (!nextEntry) {
            setErrorMessage('No encontramos esa entry para tu usuario.')
          }

          setEntry(nextEntry)
          setEntryImages(nextEntryImages)
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'No pudimos cargar la entry.',
          )
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    void loadEntry()

    return () => {
      ignore = true
    }
  }, [entryId, user])

  const defaultValues = useMemo(
    () => getEntryFormDefaultValues(entry),
    [entry],
  )

  const detailFacts = useMemo(
    () => (entry ? getHeroHighlights(entry) : []),
    [entry],
  )

  const aiRefreshCount = entry ? getAiRefreshCount(entry) : 0
  const canReanalyze = Boolean(entry && entry.status === 'draft' && aiRefreshCount < 2)

  async function createAnalysisImageFromSavedCapture(image: EntryImageRecord) {
    if (!image.imageUrl) {
      throw new Error(
        'Esta entry no tiene una captura disponible para volver a analizar.',
      )
    }

    const response = await fetch(image.imageUrl)

    if (!response.ok) {
      throw new Error(
        'No pudimos volver a descargar una de las capturas guardadas.',
      )
    }

    const blob = await response.blob()
    const fileType = blob.type || 'image/jpeg'
    const extension = fileType.split('/')[1] || 'jpg'
    const file = new File(
      [blob],
      `capture-${image.position + 1}.${extension}`,
      {
        type: fileType,
      },
    )

    return {
      name: file.name,
      type: file.type || 'image/jpeg',
      position: image.position,
      dataUrl: await createAnalysisImageDataUrl(file),
    }
  }

  async function createPendingUploadImageFromSavedCapture(
    image: EntryImageRecord,
  ): Promise<PendingUploadImage> {
    if (!image.imageUrl) {
      throw new Error('Falta una captura guardada y no pudimos conservarla.')
    }

    const response = await fetch(image.imageUrl)

    if (!response.ok) {
      throw new Error('No pudimos recuperar una captura guardada para actualizarla.')
    }

    const blob = await response.blob()
    const fileType = blob.type || 'image/jpeg'
    const extension = fileType.split('/')[1] || 'jpg'
    const fileName = getStorageFileName(
      image.imagePath,
      `capture-${image.position + 1}.${extension}`,
    )

    return {
      id: image.id,
      file: new File([blob], fileName, { type: fileType }),
      previewUrl: image.imageUrl,
      position: image.position,
      ocrText: image.ocrText,
      ocrStatus: image.ocrText ? 'success' : 'idle',
      ocrErrorMessage: null,
    }
  }

  async function handleUpdate(values: EntryFormValues) {
    if (!user || !entryId || !entry) return

    const currentEntry = entry

    setIsSubmitting(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const updatedEntry = await updateEntry(entryId, {
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
          ...currentEntry.metadata,
          ...getEntryMetadataFromForm(values),
        },
        uploaderName: currentEntry.uploaderName,
        uploaderEmail: currentEntry.uploaderEmail,
      })

      setEntry(updatedEntry)
      setSuccessMessage('Los cambios se guardaron correctamente.')
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos guardar los cambios.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!user || !entry) return

    const confirmed = window.confirm(
      `Vas a borrar "${entry.title}". Esta accion no se puede deshacer.`,
    )

    if (!confirmed) return

    setIsDeleting(true)
    setErrorMessage(null)

    try {
      await deleteEntry(entry.id)
      navigate('/', { replace: true })
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos borrar la entry.',
      )
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleReanalyze() {
    if (!user || !entry) return

    if (entry.status !== 'draft') {
      setErrorMessage(
        'Solo puedes volver a correr la IA cuando la entry esta en draft.',
      )
      return
    }

    if (entryImages.length === 0) {
      setErrorMessage('Esta entry no tiene capturas para volver a analizar.')
      return
    }

    if (getAiRefreshCount(entry) >= 2) {
      setErrorMessage(
        'Esta entry ya alcanzo el limite de 2 actualizaciones con IA.',
      )
      return
    }

    setIsReanalyzing(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const ocrTextByImage = entryImages.map((image) => ({
        name:
          image.imagePath.split('/').pop() || `capture-${image.position + 1}`,
        position: image.position,
        text: image.ocrText,
        status: 'success' as const,
        errorMessage: '',
      }))

      const combinedExtractedText = entryImages
        .map((image) => image.ocrText.trim())
        .filter(Boolean)
        .join('\n\n')

      const images = await Promise.all(
        entryImages.map((image) => createAnalysisImageFromSavedCapture(image)),
      )

      const analysis = await analyzeEntry({
        combinedExtractedText,
        images,
        ocrTextByImage,
      })
      const nextAiRefreshCount = getAiRefreshCount(entry) + 1

      const updatedEntry = await updateEntry(entry.id, {
        userId: user.id,
        type: analysis.detectedType,
        title: analysis.title.trim() || entry.title,
        summary: analysis.summary.trim() || entry.summary,
        sourceType: entry.sourceType,
        sourceName: analysis.sourceName.trim() || entry.sourceName,
        sourceUrl: entry.sourceUrl,
        status: 'draft',
        aiTags: analysis.tags.length > 0 ? analysis.tags : entry.aiTags,
        extractedText: combinedExtractedText || entry.extractedText,
        metadata: buildMetadataWithAiRefreshCount(
          {
            ...entry.metadata,
            ...analysis.fields,
          },
          nextAiRefreshCount,
        ),
        uploaderName: entry.uploaderName,
        uploaderEmail: entry.uploaderEmail,
      })

      setEntry(updatedEntry)
      setSuccessMessage('La IA actualizo el contenido de esta entry.')
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos volver a analizar esta entry con IA.',
      )
    } finally {
      setIsReanalyzing(false)
    }
  }

  async function handleAddCaptures(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFiles = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith('image/'),
    )

    if (!user || !entry || selectedFiles.length === 0) {
      return
    }

    if (!canReanalyze) {
      setErrorMessage(
        'Solo puedes agregar mas capturas mientras la entry siga en draft y con IA disponible.',
      )
      event.target.value = ''
      return
    }

    setIsUploadingCaptures(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const existingImages = await Promise.all(
        entryImages.map((image) => createPendingUploadImageFromSavedCapture(image)),
      )

      const newImages = await Promise.all(
        selectedFiles.map(async (file, index) => {
          const ocrText = await extractTextFromImage(file).catch(() => '')

          return {
            id: crypto.randomUUID(),
            file,
            previewUrl: URL.createObjectURL(file),
            position: existingImages.length + index,
            ocrText,
            ocrStatus: ocrText ? ('success' as const) : ('error' as const),
            ocrErrorMessage: ocrText ? null : 'No pudimos extraer OCR de esta captura.',
          }
        }),
      )

      const mergedImages = [...existingImages, ...newImages].map((image, index) => ({
        ...image,
        position: index,
      }))

      await replaceEntryImages(entry.id, user.id, mergedImages)

      const refreshedImages = await listEntryImages(entry.id)
      const nextExtractedText = refreshedImages
        .map((image) => image.ocrText.trim())
        .filter(Boolean)
        .join('\n\n')

      const updatedEntry = await updateEntry(entry.id, {
        userId: user.id,
        type: entry.type,
        title: entry.title,
        summary: entry.summary,
        sourceType: entry.sourceType,
        sourceName: entry.sourceName,
        sourceUrl: entry.sourceUrl,
        status: entry.status === 'reviewed' ? 'reviewed' : 'draft',
        aiTags: entry.aiTags,
        extractedText: nextExtractedText || entry.extractedText,
        metadata: entry.metadata,
        uploaderName: entry.uploaderName,
        uploaderEmail: entry.uploaderEmail,
      })

      setEntryImages(refreshedImages)
      setEntry(updatedEntry)
      setSuccessMessage('Sumamos las nuevas capturas a esta entry.')
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos agregar las nuevas capturas.',
      )
    } finally {
      setIsUploadingCaptures(false)
      event.target.value = ''
    }
  }

  if (isLoading) {
    return (
      <section className="page">
        <BackLink />

        <article className="card">
          <h2>Cargando entry</h2>
          <p>Estamos trayendo la informacion desde Supabase.</p>
        </article>
      </section>
    )
  }

  if (!entry) {
    return (
      <section className="page">
        <BackLink />

        <article className="card">
          <h2>Entry no disponible</h2>
          <p>{errorMessage ?? 'No pudimos encontrar esta entry.'}</p>
          <div className="entry-form__actions">
            <Link className="button" to="/">
              Volver al archivo
            </Link>
          </div>
        </article>
      </section>
    )
  }

  return (
    <section className="page page--detail">
      <BackLink />

      <article className="detail-hero">
        {entryImages[0]?.imageUrl ? (
          <div className="detail-hero__media">
            <img
              src={entryImages[0].imageUrl}
              alt={entry.title}
              className="detail-hero__image"
            />
          </div>
        ) : null}

        <div className="detail-hero__content">
          <div className="detail-hero__eyebrow">
            <span className="entry-card__type">
              {entryTypeLabelMap[entry.type]}
            </span>
            <span className="detail-chip">Actualizado {formatDate(entry.updatedAt)}</span>
            {entry.sourceName ? <span className="detail-chip">{entry.sourceName}</span> : null}
          </div>

          {entry.status === 'draft' ? (
            <div className="detail-hero__inline-actions">
              <button
                type="button"
                className="button"
                disabled={!canReanalyze || isReanalyzing || isSubmitting || isDeleting}
                onClick={() => {
                  void handleReanalyze()
                }}
              >
                {isReanalyzing
                  ? 'Actualizando con IA...'
                  : canReanalyze
                    ? 'Volver a analizar con IA'
                    : 'Limite de IA alcanzado'}
              </button>
              <span className="muted">
                {aiRefreshCount}/2 reanalisis usados -solo tenes 2 chances por el momento-
              </span>
            </div>
          ) : null}

          <h1>{entry.title}</h1>
          <p className="detail-hero__summary">
            {entry.summary || 'Todavia no agregaste un resumen para este item.'}
          </p>

          {detailFacts.length > 0 ? (
            <div className="detail-highlight-grid">
              {detailFacts.map((fact) => (
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

          {entry.aiTags.length > 0 ? (
            <div className="detail-tag-row">
              {entry.aiTags.map((tag) => (
                <span key={tag} className="detail-chip">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

      </article>

      <article className="card">
        <div className="section-title">
          <h2>Editar item</h2>
          <p>Ajusta los datos y guarda cuando este listo.</p>
        </div>

        <EntryForm
          defaultValues={defaultValues}
          isSubmitting={isSubmitting}
          isDeleting={isDeleting}
          isStatusLocked={entry.status !== 'draft'}
          submitLabel="Guardar cambios"
          submitBusyLabel="Guardando..."
          errorMessage={errorMessage}
          successMessage={successMessage}
          onSubmit={handleUpdate}
          onDelete={handleDelete}
        />
      </article>

      <article className="card">
        <div className="section-title">
          <h2>Capturas asociadas</h2>
          <p>Todas las imagenes que quedaron guardadas para esta entrada.</p>
        </div>

        {canReanalyze ? (
          <div className="entry-form__actions">
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(event) => {
                void handleAddCaptures(event)
              }}
            />
            <button
              type="button"
              className="button--ghost"
              disabled={isUploadingCaptures}
              onClick={() => {
                uploadInputRef.current?.click()
              }}
            >
              {isUploadingCaptures ? 'Agregando capturas...' : 'Agregar mas capturas'}
            </button>
          </div>
        ) : null}

        {entryImages.length === 0 ? (
          <p className="muted">Esta entry todavia no tiene capturas asociadas.</p>
        ) : (
          <div className="capture-grid">
            {entryImages.map((image) => (
              <article key={image.id} className="capture-card">
                {image.imageUrl ? (
                  <img
                    src={image.imageUrl}
                    alt={`Captura ${image.position + 1}`}
                    className="capture-card__image"
                  />
                ) : (
                  <div className="capture-card__placeholder">Sin preview</div>
                )}
                <div className="capture-card__content">
                  <strong>Captura {image.position + 1}</strong>
                </div>
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  )
}
