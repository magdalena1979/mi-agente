import { useState } from 'react'

import {
  createEntriesShareInvitation,
  sendShareInvitationEmail,
} from '@/features/lists/lists-api'

type ShareEntriesModalProps = {
  isOpen: boolean
  currentUserId: string
  onClose: () => void
  onSuccess?: () => Promise<void> | void
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'No pudimos crear la invitacion.'
}

export function ShareEntriesModal({
  isOpen,
  currentUserId,
  onClose,
  onSuccess,
}: ShareEntriesModalProps) {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)

  if (!isOpen) {
    return null
  }

  async function handleCopyLink() {
    if (!inviteLink) {
      return
    }

    try {
      await navigator.clipboard.writeText(inviteLink)
      setSuccessMessage('Link copiado. Ya puedes compartirlo manualmente.')
    } catch {
      setErrorMessage('No pudimos copiar el link automaticamente.')
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail) {
      setErrorMessage('Ingresa un email para continuar.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    setInviteLink(null)

    const token = crypto.randomUUID()
    const nextInviteLink = `${window.location.origin}/accept-invite?token=${token}`

    try {
      await createEntriesShareInvitation({
        email: normalizedEmail,
        token,
        invitedBy: currentUserId,
      })

      setInviteLink(nextInviteLink)

      try {
        await sendShareInvitationEmail({
          email: normalizedEmail,
          token,
          shareScope: 'entries',
          inviteLink: nextInviteLink,
        })

        setSuccessMessage('Invitacion enviada correctamente.')
      } catch {
        setSuccessMessage(
          'La invitacion se guardo, pero el email no se envio automaticamente. Comparte el link manualmente.',
        )
      }

      setEmail('')
      await onSuccess?.()
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-entries-title"
      >
        <div className="section-title">
          <h2 id="share-entries-title">Share with</h2>
          <p>Invita a otra persona por email para compartir tus entradas.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Email</span>
            <input
              type="email"
              placeholder="Email de la persona invitada"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
              }}
            />
          </label>

          {errorMessage ? <p className="feedback feedback--error">{errorMessage}</p> : null}
          {successMessage ? (
            <p className="feedback feedback--success">{successMessage}</p>
          ) : null}
          {inviteLink ? (
            <label className="form-field">
              <span>Link de invitacion</span>
              <input type="text" readOnly value={inviteLink} />
            </label>
          ) : null}

          <div className="entry-form__actions">
            <button type="submit" className="button" disabled={isSubmitting}>
              {isSubmitting ? 'Enviando...' : 'Enviar invitacion'}
            </button>

            {inviteLink ? (
              <button
                type="button"
                className="button--ghost"
                onClick={() => {
                  void handleCopyLink()
                }}
              >
                Copiar link
              </button>
            ) : null}

            <button
              type="button"
              className="button--ghost"
              onClick={() => {
                setEmail('')
                setErrorMessage(null)
                setSuccessMessage(null)
                setInviteLink(null)
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
