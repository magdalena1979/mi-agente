import type { UserCategoryRecord } from '@/types/categories'

type ManageUserCategoriesModalProps = {
  isOpen: boolean
  categories: UserCategoryRecord[]
  deletingCategoryId?: string | null
  errorMessage?: string | null
  onClose: () => void
  onDelete: (category: UserCategoryRecord) => Promise<void> | void
}

export function ManageUserCategoriesModal({
  isOpen,
  categories,
  deletingCategoryId,
  errorMessage,
  onClose,
  onDelete,
}: ManageUserCategoriesModalProps) {
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
          <h2 id="manage-user-categories-title">Editar subcategorias</h2>
          <p>
            Estas son tus subcategorias o tags personales. Si borras una, se saca de tu lista y
            tambien de las entries donde la estabas usando.
          </p>
        </div>

        {errorMessage ? <p className="feedback feedback--error">{errorMessage}</p> : null}

        {categories.length === 0 ? (
          <p className="muted">Todavia no tenes subcategorias personales.</p>
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
                      ? `Borrando ${category.name}`
                      : `Borrar ${category.name}`
                  }
                  title="Borrar subcategoria"
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

        <div className="entry-form__actions">
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
