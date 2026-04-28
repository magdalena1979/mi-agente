import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-context'

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'No pudimos actualizar la contraseña.'
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const { user, isLoading, updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (password.trim().length < 6) {
      setErrorMessage('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('Las contraseñas no coinciden.')
      return
    }

    setIsSubmitting(true)

    try {
      await updatePassword(password)
      setSuccessMessage('Tu contraseña se actualizo correctamente.')
      setTimeout(() => {
        navigate('/', { replace: true })
      }, 1200)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <section className="page">
        <article className="card">
          <h2>Preparando recuperacion</h2>
          <p>Estamos verificando tu link para cambiar la contraseña.</p>
        </article>
      </section>
    )
  }

  if (!user) {
    return (
      <section className="page">
        <article className="card">
          <div className="section-title">
            <h1>Restablecer contraseña</h1>
            <p>Este link ya no es valido o expiro. Pide uno nuevo para continuar.</p>
          </div>

          <div className="entry-form__actions">
            <Link className="button" to="/auth">
              Volver a iniciar sesion
            </Link>
          </div>
        </article>
      </section>
    )
  }

  return (
    <section className="page">
      <article className="card">
        <div className="section-title">
          <h1>Nueva contraseña</h1>
          <p>Elige una contraseña nueva para tu cuenta.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Nueva contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Minimo 6 caracteres"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
              }}
            />
          </label>

          <label className="form-field">
            <span>Repetir contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Repite la contraseña"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value)
              }}
            />
          </label>

          {errorMessage ? <p className="feedback feedback--error">{errorMessage}</p> : null}
          {successMessage ? (
            <p className="feedback feedback--success">{successMessage}</p>
          ) : null}

          <div className="entry-form__actions">
            <button type="submit" className="button" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Actualizar contraseña'}
            </button>

            <Link className="button--ghost" to="/auth">
              Cancelar
            </Link>
          </div>
        </form>
      </article>
    </section>
  )
}
