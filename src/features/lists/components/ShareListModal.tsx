import { useState } from 'react'

import {
  createInvitation,
  sendShareInvitationEmail,
} from '@/features/lists/lists-api'
import type { ListRecord } from '@/types/lists'

type ShareListModalProps = {
  isOpen: boolean
  list: ListRecord | null
  currentUserId: string
  onClose: () => void
  onSuccess?: () => Promise<void> | void
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'No pudimos enviar la invitacion.'
}

export function ShareListModal({
  isOpen,
  list,
  currentUserId,
  onClose,
  onSuccess,
}: ShareListModalProps) {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)

  if (!isOpen || !list) {
    return null
  }

  const currentList = list

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
      await createInvitation({
        listId: currentList.id,
        email: normalizedEmail,
        token,
        invitedBy: currentUserId,
      })

      setInviteLink(nextInviteLink)

      try {
        await sendShareInvitationEmail({
          email: normalizedEmail,
          token,
          listName: currentList.name,
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
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="share-list-title">
        <div className="section-title">
          <h2 id="share-list-title">Share with</h2>
          <p>Invita a otra persona por email para colaborar en {currentList.name}.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Email</span>
            <input
              type="email"
              placeholder="persona@email.com"
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
              {isSubmitting ? 'Enviando...' : 'Send invite'}
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
