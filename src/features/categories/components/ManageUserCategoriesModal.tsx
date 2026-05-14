import { useEffect, useState } from 'react'

import type { CategoryRecord } from '@/types/categories'

type ManageUserCategoriesModalProps = {
  isOpen: boolean
  categories: CategoryRecord[]
  deletingCategoryId?: string | null
  errorMessage?: string | null
  onClose: () => void
  onDelete: (category: CategoryRecord) => Promise<void> | void
  onCreate?: (name: string) => Promise<void> | void
}

export function ManageUserCategoriesModal({
  isOpen,
  categories,
  deletingCategoryId,
  errorMessage,
  onClose,
  onDelete,
  onCreate,
}: ManageUserCategoriesModalProps) {
  const [newCategoryName, setNewCategoryName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setNewCategoryName('')
    }
  }, [isOpen])
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-card modal-card--category-manage"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-user-categories-title"
      >
        <div className="section-title">
          <h2 id="manage-user-categories-title">Gestionar tags</h2>
          <p>Estos tags organizan tu biblioteca. Refind también puede crearlos automáticamente al generar una ficha.</p>
        </div>

        {errorMessage ? <p className="feedback feedback--error">{errorMessage}</p> : null}

        {categories.length === 0 ? (
          <p className="muted">Todavía no tienes tags guardados.</p>
        ) : (
          <div className="category-manage-list">
            {categories.map((category) => (
              <article key={category.id} className="category-manage-item">
                <strong>{category.name}</strong>

                <button
                  type="button"
                  className="button--subtle-danger button--icon-only"
                  aria-label={
                    deletingCategoryId === category.id
                      ? `Eliminando ${category.name}`
                      : `Eliminar ${category.name}`
                  }
                  title="Eliminar tag"
                  disabled={deletingCategoryId === category.id}
                  onClick={() => {
                    void onDelete(category)
                  }}
                >
                  {deletingCategoryId === category.id ? (
                    '...'
                  ) : (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="action-icon"
                    >
                      <path
                        d="M9 3h6m-9 4h12m-1 0-.8 11.2A2 2 0 0 1 14.2 20H9.8a2 2 0 0 1-1.99-1.8L7 7m3 4v5m4-5v5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </article>
            ))}
          </div>
        )}

        {onCreate && (
          <label className="form-field">
            <span>Agregar tag</span>
            <input
              type="text"
              placeholder="Ej. Astrologia, Diabetes, Ideas para casa"
              value={newCategoryName}
              onChange={(event) => {
                setNewCategoryName(event.target.value)
              }}
            />
          </label>
        )}

        <div className="entry-form__actions">
          {onCreate && newCategoryName.trim() && (
            <button
              type="button"
              className="button"
              disabled={isCreating}
              onClick={async () => {
                setIsCreating(true)

                try {
                  await onCreate(newCategoryName.trim())
                  setNewCategoryName('')
                } finally {
                  setIsCreating(false)
                }
              }}
            >
              {isCreating ? 'Agregando...' : 'Agregar'}
            </button>
          )}

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
      </div>
    </div>
  )
}
