import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  entryTypeOptions,
  getVisibleEntryFieldDefinitions,
} from '@/features/entries/config/entry-type-config'
import {
  entryFormSchema,
  entrySourceOptions,
  type EntryFormValues,
} from '@/features/entries/entry-form-schema'
import type { CategoryRecord } from '@/types/categories'

const CATEGORY_DELETE_PRESS_MS = 350
const CATEGORY_DELETE_MOVE_TOLERANCE = 12

type EntryFormProps = {
  defaultValues: EntryFormValues
  isSubmitting: boolean
  submitLabel: string
  submitBusyLabel: string
  errorMessage?: string | null
  successMessage?: string | null
  canSubmit?: boolean
  submitDisabledReason?: string | null
  formId?: string
  showActions?: boolean
  onSubmit: (values: EntryFormValues) => Promise<void> | void
  onDelete?: () => Promise<void> | void
  isDeleting?: boolean
  isReadOnly?: boolean
  availableCategories?: CategoryRecord[]
  selectedCategoryIds?: string[]
  onToggleCategory?: (categoryId: string) => void
  onOpenManageCategories?: () => void
  onDeleteCategory?: (category: CategoryRecord) => Promise<void> | void
  deletingCategoryId?: string | null
  highlightEditableFields?: boolean
  collapseSecondarySections?: boolean
}

function formatEntrySourceOption(sourceType: EntryFormValues['sourceType']) {
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

export function EntryForm({
  defaultValues,
  isSubmitting,
  submitLabel,
  submitBusyLabel,
  errorMessage,
  successMessage,
  canSubmit = true,
  submitDisabledReason,
  formId,
  showActions = true,
  onSubmit,
  onDelete,
  isDeleting = false,
  isReadOnly = false,
  availableCategories = [],
  selectedCategoryIds = [],
  onToggleCategory,
  onOpenManageCategories,
  onDeleteCategory,
  deletingCategoryId,
  highlightEditableFields = false,
  collapseSecondarySections = false,
}: EntryFormProps) {
  const form = useForm<EntryFormValues>({
    resolver: zodResolver(entryFormSchema),
    defaultValues,
  })

  const selectedType = useWatch({
    control: form.control,
    name: 'type',
  })
  const selectedSourceType = useWatch({
    control: form.control,
    name: 'sourceType',
  })
  const visibleFields = getVisibleEntryFieldDefinitions(selectedType)
  const primaryDetailKeys = new Set([
    'platform',
    'cast',
    'genre',
    'note',
    'author',
    'ingredientsText',
    'location',
    'date',
    'topic',
  ])
  const detailFields = visibleFields.filter((field) => primaryDetailKeys.has(field.key))
  const advancedFields = visibleFields.filter((field) => !primaryDetailKeys.has(field.key))
  const isSubmitDisabled = !canSubmit || isSubmitting || isDeleting
  const isLinkSource = selectedSourceType === 'link'
  const isFormReadOnly = isReadOnly
  const categoryLongPressTimerRef = useRef<number | null>(null)
  const categoryPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const skipCategoryClickRef = useRef(false)
  const [deleteModeCategoryId, setDeleteModeCategoryId] = useState<string | null>(null)
  const visibleCategories = useMemo(
    () =>
      [...availableCategories].sort((leftCategory, rightCategory) => {
        const leftSelected = selectedCategoryIds.includes(leftCategory.id)
        const rightSelected = selectedCategoryIds.includes(rightCategory.id)

        if (leftSelected !== rightSelected) {
          return leftSelected ? -1 : 1
        }

        return leftCategory.name.localeCompare(rightCategory.name)
      }),
    [availableCategories, selectedCategoryIds],
  )

  function clearCategoryLongPressTimer() {
    if (categoryLongPressTimerRef.current !== null) {
      window.clearTimeout(categoryLongPressTimerRef.current)
      categoryLongPressTimerRef.current = null
    }
  }

  function handleCategoryPressStart(categoryId: string, clientX: number, clientY: number) {
    if (!onDeleteCategory || isFormReadOnly) {
      return
    }

    clearCategoryLongPressTimer()
    categoryPressStartRef.current = { x: clientX, y: clientY }
    skipCategoryClickRef.current = false

    categoryLongPressTimerRef.current = window.setTimeout(() => {
      setDeleteModeCategoryId(categoryId)
      skipCategoryClickRef.current = true
    }, CATEGORY_DELETE_PRESS_MS)
  }

  function handleCategoryPressMove(clientX: number, clientY: number) {
    const start = categoryPressStartRef.current

    if (!start) {
      return
    }

    const moved =
      Math.abs(clientX - start.x) > CATEGORY_DELETE_MOVE_TOLERANCE ||
      Math.abs(clientY - start.y) > CATEGORY_DELETE_MOVE_TOLERANCE

    if (moved) {
      clearCategoryLongPressTimer()
      categoryPressStartRef.current = null
    }
  }

  function handleCategoryPressEnd() {
    clearCategoryLongPressTimer()
    categoryPressStartRef.current = null
  }

  function renderDeleteCategoryContent() {
    return (
      <span className="filter-chip__delete-content">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="filter-chip__delete-icon">
          <path
            d="M9 3h6m-9 4h12m-1 0-.8 11.2A2 2 0 0 1 14.2 20H9.8a2 2 0 0 1-1.99-1.8L7 7m3 4v5m4-5v5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
        <span>Eliminar</span>
      </span>
    )
  }

  function renderMetadataField(field: (typeof visibleFields)[number]) {
    return (
      <label
        className={
          field.input === 'textarea'
            ? 'form-field form-field--full'
            : 'form-field'
        }
        key={field.key}
      >
        <span>{field.label}</span>
        {field.input === 'textarea' ? (
          <textarea
            rows={field.key === 'ingredientsText' ? 5 : 4}
            placeholder={field.placeholder}
            disabled={isFormReadOnly}
            {...form.register(field.key)}
          />
        ) : (
          <input
            type="text"
            placeholder={field.placeholder}
            disabled={isFormReadOnly}
            {...form.register(field.key)}
          />
        )}
      </label>
    )
  }

  useEffect(() => {
    form.reset(defaultValues)
  }, [defaultValues, form])

  useEffect(() => {
    if (isFormReadOnly) {
      form.reset(defaultValues)
    }
  }, [defaultValues, form, isFormReadOnly])

  useEffect(() => {
    return () => {
      clearCategoryLongPressTimer()
    }
  }, [])

  return (
    <form
      id={formId}
      className={[
        'entry-form',
        isFormReadOnly ? 'entry-form--readonly' : '',
        highlightEditableFields && !isFormReadOnly ? 'entry-form--editing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <input type="hidden" {...form.register('status')} />
      <input type="hidden" {...form.register('extractedText')} />

      {errorMessage ? <p className="feedback feedback--error">{errorMessage}</p> : null}
      {successMessage ? (
        <p className="feedback feedback--success">{successMessage}</p>
      ) : null}
      {submitDisabledReason && !canSubmit ? (
        <p className="muted">{submitDisabledReason}</p>
      ) : null}

      {showActions ? (
        <div className="entry-form__actions">
          <button type="submit" className="button" disabled={isSubmitDisabled}>
            {isSubmitting ? submitBusyLabel : submitLabel}
          </button>

          {onDelete ? (
            <button
              type="button"
              className="button--danger"
              disabled={isSubmitting || isDeleting}
              onClick={() => {
                void onDelete()
              }}
            >
              {isDeleting ? 'Borrando...' : 'Borrar entry'}
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="form-section form-section--basic">
        <div className="form-section__header">
          <h3 className="form-section__title">Básico</h3>
          <p className="form-section__description">
            Solo lo esencial para que la ficha quede clara y fácil de encontrar.
          </p>
        </div>

        <div className="field-grid">
          <label className="form-field">
            <span>Título</span>
            <input
              type="text"
              placeholder="Ej. El viaje de Chihiro, brownie de banana, feria de libros"
              disabled={isFormReadOnly}
              {...form.register('title')}
            />
            {form.formState.errors.title ? (
              <small className="form-error">{form.formState.errors.title.message}</small>
            ) : null}
          </label>
        </div>

        <label className="form-field">
          <span>Resumen</span>
          <textarea
            rows={4}
            placeholder="Descripción corta o contexto útil para encontrar esta entry después."
            disabled={isFormReadOnly}
            {...form.register('summary')}
          />
        </label>

        <label className="form-field">
          <span>Tags detectados</span>
          <input
            type="text"
            placeholder="Separados por coma"
            disabled={isFormReadOnly}
            {...form.register('tagsText')}
          />
        </label>

        <div className="form-field">
          <span>Tags guardados</span>
          <p className="form-helper">
            Se usan como filtros de tu biblioteca. Refind puede crearlos automáticamente desde los tags detectados.
          </p>

          <div className="category-filter-grid category-filter-grid--form">
            {visibleCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={
                  [
                    selectedCategoryIds.includes(category.id)
                      ? 'filter-chip filter-chip--active'
                      : 'filter-chip',
                    deleteModeCategoryId === category.id
                      ? 'filter-chip--delete-mode'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                }
                disabled={isFormReadOnly || deletingCategoryId === category.id}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture?.(event.pointerId)
                  handleCategoryPressStart(category.id, event.clientX, event.clientY)
                }}
                onPointerUp={handleCategoryPressEnd}
                onPointerMove={(event) => {
                  handleCategoryPressMove(event.clientX, event.clientY)
                }}
                onPointerCancel={handleCategoryPressEnd}
                onPointerLeave={handleCategoryPressEnd}
                onContextMenu={(event) => {
                  if (onDeleteCategory) {
                    event.preventDefault()
                  }
                }}
                onClick={() => {
                  if (skipCategoryClickRef.current) {
                    skipCategoryClickRef.current = false
                    return
                  }

                  clearCategoryLongPressTimer()

                  if (deleteModeCategoryId === category.id && onDeleteCategory) {
                    setDeleteModeCategoryId(null)
                    void onDeleteCategory(category)
                    return
                  }

                  setDeleteModeCategoryId(null)
                  onToggleCategory?.(category.id)
                }}
              >
                {deletingCategoryId === category.id
                  ? 'Eliminando...'
                  : deleteModeCategoryId === category.id
                    ? renderDeleteCategoryContent()
                    : category.name}
              </button>
            ))}

            <button
              type="button"
              className="filter-chip filter-chip--add"
              disabled={isFormReadOnly}
              onClick={() => {
                onOpenManageCategories?.()
              }}
            >
              Gestionar tags
            </button>
          </div>
        </div>
      </section>

      {detailFields.length > 0 ? (
        <details
          className="form-section form-section--panel"
          {...(collapseSecondarySections ? {} : { open: true })}
        >
          <summary className="form-section__summary">
            <span>
              <strong>Detalles</strong>
              <small>Plataforma, género, reparto y notas útiles.</small>
            </span>
          </summary>

          <div className="field-grid">
            {detailFields.map((field) => renderMetadataField(field))}
          </div>
        </details>
      ) : null}

      <details className="form-section form-section--panel form-section--advanced">
        <summary className="form-section__summary">
          <span>
            <strong>Info avanzada</strong>
            <small>Origen y datos menos frecuentes.</small>
          </span>
        </summary>

        {advancedFields.length > 0 ? (
          <div className="field-grid">
            {advancedFields.map((field) => renderMetadataField(field))}
          </div>
        ) : null}

        <div className="field-grid">
          <label className="form-field">
            <span>Tipo interno</span>
            <select {...form.register('type')} disabled={isFormReadOnly}>
              {entryTypeOptions.map((option) => (
                <option key={option.type} value={option.type}>
                  {option.label}
                </option>
              ))}
            </select>
            {form.formState.errors.type ? (
              <small className="form-error">{form.formState.errors.type.message}</small>
            ) : null}
          </label>

          <label className="form-field">
            <span>Origen</span>
            <select {...form.register('sourceType')} disabled={isFormReadOnly}>
              {entrySourceOptions.map((sourceType) => (
                <option key={sourceType} value={sourceType}>
                  {formatEntrySourceOption(sourceType)}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Nombre de la fuente</span>
            <input
              type="text"
              placeholder="Ej. Instagram, WhatsApp, newsletter, articulo"
              disabled={isFormReadOnly}
              {...form.register('sourceName')}
            />
          </label>
        </div>

        {isLinkSource ? (
          <label className="form-field">
            <span>Link</span>
            <input
              type="url"
              placeholder="https://..."
              disabled={isFormReadOnly}
              {...form.register('sourceUrl')}
            />
          </label>
        ) : null}

      </details>
    </form>
  )
}
