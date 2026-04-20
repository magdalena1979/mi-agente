import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-context'
import { EntryForm } from '@/features/entries/components/EntryForm'
import {
  entryFieldDefinitions,
  entryTypeOptions,
  getEntryMetadataFieldsForType,
} from '@/features/entries/config/entry-type-config'
import {
  deleteEntry,
  getEntry,
  updateEntry,
} from '@/features/entries/entries-api'
import { listEntryImages } from '@/features/entries/entry-images-api'
import {
  getEntryFormDefaultValues,
  getEntryMetadataFromForm,
  parseTags,
  type EntryFormValues,
} from '@/features/entries/entry-form-schema'
import type { EntryImageRecord, EntryRecord, EntryType } from '@/types/entries'

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

function getDetailFacts(entry: EntryRecord) {
  const metadataKeys = getEntryMetadataFieldsForType(entry.type)

  const metadataFacts = metadataKeys
    .map((key) => {
      const value = entry.metadata[key]?.trim()

      if (!value) {
        return null
      }

      return {
        label: entryFieldDefinitions[key].label,
        value,
      }
    })
    .filter(Boolean) as Array<{ label: string; value: string }>

  const baseFacts = [
    {
      label: 'Origen',
      value: entry.sourceName || entry.sourceType,
    },
    ...(entry.sourceUrl
      ? [
          {
            label: 'Link',
            value: entry.sourceUrl,
          },
        ]
      : []),
    ...(entry.uploaderName || entry.uploaderEmail
      ? [
          {
            label: 'Subido por',
            value: entry.uploaderName || entry.uploaderEmail || '',
          },
        ]
      : []),
    {
      label: 'Estado',
      value: entry.status,
    },
  ]

  return [...baseFacts, ...metadataFacts]
}

export function EntryDetailPage() {
  const navigate = useNavigate()
  const { entryId } = useParams()
  const { user } = useAuth()
  const [entry, setEntry] = useState<EntryRecord | null>(null)
  const [entryImages, setEntryImages] = useState<EntryImageRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
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
    () => (entry ? getDetailFacts(entry) : []),
    [entry],
  )

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
        metadata: getEntryMetadataFromForm(values),
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

  if (isLoading) {
    return (
      <section className="page">
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
      <div className="detail-back-row">
        <Link className="detail-back-link" to="/">
          <span aria-hidden="true">←</span>
          <span>Volver</span>
        </Link>
      </div>

      <article className="detail-hero">
        <div className="detail-hero__content">
          <div className="detail-hero__eyebrow">
            <span className="entry-card__type">
              {entryTypeLabelMap[entry.type]}
            </span>
            <span className="detail-chip">Actualizado {formatDate(entry.updatedAt)}</span>
          </div>

          <h1>{entry.title}</h1>
          <p>
            {entry.summary || 'Todavia no agregaste un resumen para este item.'}
          </p>

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

        <div className="detail-hero__actions">
          <Link className="button--ghost" to="/">
            Volver al archivo
          </Link>
        </div>
      </article>

      <div className="detail-layout">
        <div className="detail-layout__main">
          <article className="card">
            <div className="section-title">
              <h2>Vista general</h2>
              <p>Los datos mas importantes del item guardado.</p>
            </div>

            <div className="detail-facts">
              {detailFacts.map((fact) => (
                <div key={`${fact.label}-${fact.value}`} className="detail-fact">
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="card">
            <div className="section-title">
              <h2>Capturas asociadas</h2>
              <p>Todas las imagenes que quedaron guardadas para esta entrada.</p>
            </div>

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
                      <small className="muted">{image.imagePath}</small>
                      <small className="muted">
                        {image.ocrText
                          ? image.ocrText.slice(0, 180)
                          : 'Sin OCR guardado'}
                        {image.ocrText.length > 180 ? '...' : ''}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>

          <article className="card">
            <div className="section-title">
              <h2>Texto OCR</h2>
              <p>Texto consolidado extraido desde las capturas.</p>
            </div>
            <textarea
              rows={12}
              value={entry.extractedText}
              readOnly
              className="detail-readonly"
            />
          </article>
        </div>

        <aside className="detail-layout__side">
          <article className="card">
            <div className="section-title">
              <h2>Editar item</h2>
              <p>Ajusta los datos y guarda cuando este listo.</p>
            </div>

            <EntryForm
              defaultValues={defaultValues}
              isSubmitting={isSubmitting}
              isDeleting={isDeleting}
              submitLabel="Guardar cambios"
              submitBusyLabel="Guardando..."
              errorMessage={errorMessage}
              successMessage={successMessage}
              onSubmit={handleUpdate}
              onDelete={handleDelete}
            />
          </article>
        </aside>
      </div>
    </section>
  )
}
