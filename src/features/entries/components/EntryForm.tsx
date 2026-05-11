import { useEffect } from 'react'
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

  return (
    <form
      id={formId}
      className={isFormReadOnly ? 'entry-form entry-form--readonly' : 'entry-form'}
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
          <h3 className="form-section__title">Basico</h3>
          <p className="form-section__description">
            Solo lo esencial para que la ficha quede clara y facil de encontrar.
          </p>
        </div>

        <div className="field-grid">
          <label className="form-field">
            <span>Titulo</span>
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
            placeholder="Descripcion corta o contexto util para encontrar esta entry despues."
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
            Se usan como filtros de tu biblioteca. Refind puede crearlos automaticamente desde los tags detectados.
          </p>

          <div className="category-filter-grid category-filter-grid--form">
            {availableCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={
                  selectedCategoryIds.includes(category.id)
                    ? 'filter-chip filter-chip--active'
                    : 'filter-chip'
                }
                disabled={isFormReadOnly}
                onClick={() => {
                  onToggleCategory?.(category.id)
                }}
              >
                {category.name}
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
        <details className="form-section form-section--panel" open>
          <summary className="form-section__summary">
            <span>
              <strong>Detalles</strong>
              <small>Plataforma, genero, reparto y notas utiles.</small>
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
                  {sourceType}
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
