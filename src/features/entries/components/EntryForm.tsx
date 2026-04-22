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
  const isSubmitDisabled = !canSubmit || isSubmitting || isDeleting
  const isLinkSource = selectedSourceType === 'link'

  useEffect(() => {
    form.reset(defaultValues)
  }, [defaultValues, form])

  return (
    <form
      id={formId}
      className="entry-form"
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

      <div className="field-grid">
        <label className="form-field">
          <span>Tipo</span>
          <select {...form.register('type')}>
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
      </div>

      <label className="form-field">
        <span>Titulo</span>
        <input
          type="text"
          placeholder="Ej. El viaje de Chihiro, brownie de banana, feria de libros"
          {...form.register('title')}
        />
        {form.formState.errors.title ? (
          <small className="form-error">{form.formState.errors.title.message}</small>
        ) : null}
      </label>

      <label className="form-field">
        <span>Resumen</span>
        <textarea
          rows={4}
          placeholder="Descripcion corta o contexto util para encontrar esta entry despues."
          {...form.register('summary')}
        />
      </label>

      <div className="field-grid">
        <label className="form-field">
          <span>Origen</span>
          <select {...form.register('sourceType')}>
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
            {...form.register('sourceUrl')}
          />
        </label>
      ) : null}

      <label className="form-field">
        <span>Tags</span>
        <input
          type="text"
          placeholder="Separados por coma"
          {...form.register('tagsText')}
        />
      </label>

      {visibleFields.length > 0 ? (
        <div className="field-grid">
          {visibleFields.map((field) => (
            <label className="form-field" key={field.key}>
              <span>{field.label}</span>
              {field.input === 'textarea' ? (
                <textarea
                  rows={field.key === 'ingredientsText' ? 5 : 4}
                  placeholder={field.placeholder}
                  {...form.register(field.key)}
                />
              ) : (
                <input
                  type="text"
                  placeholder={field.placeholder}
                  {...form.register(field.key)}
                />
              )}
            </label>
          ))}
        </div>
      ) : null}

    </form>
  )
}
