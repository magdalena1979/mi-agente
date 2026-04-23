import { useEffect, useMemo, useState } from 'react'

type UserCategorySetupModalProps = {
  isOpen: boolean
  suggestedNames: string[]
  isSubmitting?: boolean
  errorMessage?: string | null
  onClose: () => void
  onSubmit: (input: { selectedNames: string[]; customName: string }) => Promise<void> | void
}

export function UserCategorySetupModal({
  isOpen,
  suggestedNames,
  isSubmitting = false,
  errorMessage,
  onClose,
  onSubmit,
}: UserCategorySetupModalProps) {
  const [selectedNames, setSelectedNames] = useState<string[]>(suggestedNames)
  const [customName, setCustomName] = useState('')

  const orderedNames = useMemo(
    () => suggestedNames.slice().sort((leftName, rightName) => leftName.localeCompare(rightName)),
    [suggestedNames],
  )

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setSelectedNames(suggestedNames)
    setCustomName('')
  }, [isOpen, suggestedNames])

  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-category-setup-title"
      >
        <div className="section-title">
          <h2 id="user-category-setup-title">Tus subcategorias personales</h2>
          <p>
            Estas categorias funcionan como subcategorias o tags tuyos. Podes
            elegir algunas por default y sumar una propia si ya sabes como te gusta
            organizar el archivo.
          </p>
        </div>

        <div className="category-filter-grid category-filter-grid--setup">
          {orderedNames.map((name) => {
            const isSelected = selectedNames.includes(name)

            return (
              <button
                key={name}
                type="button"
                className={
                  isSelected
                    ? 'filter-chip filter-chip--active'
                    : 'filter-chip'
                }
                onClick={() => {
                  setSelectedNames((currentNames) =>
                    currentNames.includes(name)
                      ? currentNames.filter((currentName) => currentName !== name)
                      : [...currentNames, name],
                  )
                }}
              >
                {name}
              </button>
            )
          })}
        </div>

        <label className="form-field">
          <span>Agregar una propia</span>
          <input
            type="text"
            placeholder="Ej. K-dramas, Ideas para casa, Favoritos de Male"
            value={customName}
            onChange={(event) => {
              setCustomName(event.target.value)
            }}
          />
        </label>

        {errorMessage ? <p className="feedback feedback--error">{errorMessage}</p> : null}

        <div className="entry-form__actions">
          <button
            type="button"
            className="button"
            disabled={isSubmitting}
            onClick={() => {
              void onSubmit({ selectedNames, customName })
            }}
          >
            {isSubmitting ? 'Guardando...' : 'Guardar categorias'}
          </button>

          <button
            type="button"
            className="button--ghost"
            onClick={() => {
              onClose()
            }}
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  )
}
