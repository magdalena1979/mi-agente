import { useEffect, useState } from 'react'

type CreateUserCategoryModalProps = {
  isOpen: boolean
  title?: string
  description?: string
  isSubmitting?: boolean
  errorMessage?: string | null
  onClose: () => void
  onSubmit: (name: string) => Promise<void> | void
}

export function CreateUserCategoryModal({
  isOpen,
  title = 'Nueva subcategoria',
  description = 'Estas categorias funcionan como subcategorias personales o tags tuyos para ordenar mejor tu archivo. No cambian el tipo de la entry.',
  isSubmitting = false,
  errorMessage,
  onClose,
  onSubmit,
}: CreateUserCategoryModalProps) {
  const [name, setName] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setName('')
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-category-title"
      >
        <div className="section-title">
          <h2 id="create-user-category-title">{title}</h2>
          <p>{description}</p>
        </div>

        <form
          className="auth-form"
          onSubmit={async (event) => {
            event.preventDefault()
            await onSubmit(name)
          }}
        >
          <label className="form-field">
            <span>Nombre</span>
            <input
              type="text"
              placeholder="Ej. Documentales, K-dramas, Ideas para Male"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
              }}
            />
          </label>

          {errorMessage ? <p className="feedback feedback--error">{errorMessage}</p> : null}

          <div className="entry-form__actions">
            <button type="submit" className="button" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>

            <button
              type="button"
              className="button--ghost"
              onClick={() => {
                onClose()
              }}
            >
              Cerrar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
