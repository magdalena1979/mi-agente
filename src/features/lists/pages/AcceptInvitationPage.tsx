import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-context'
import {
  acceptInvitation,
  getInvitationByToken,
} from '@/features/lists/lists-api'
import type { InvitationLookupRecord } from '@/types/lists'

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'No pudimos aceptar la invitacion.'
}

function getInvitationTitle(invitation: InvitationLookupRecord | null) {
  if (!invitation) {
    return 'Aceptar invitacion'
  }

  return invitation.listId
    ? 'Aceptar invitacion a lista'
    : 'Aceptar acceso compartido'
}

function getInvitationDescription(invitation: InvitationLookupRecord | null) {
  if (!invitation) {
    return 'Usa este paso para sumarte a una invitacion compartida.'
  }

  return invitation.listId
    ? 'Usa este paso para sumarte a una lista compartida.'
    : 'Usa este paso para recibir acceso a entradas compartidas.'
}

export function AcceptInvitationPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const [invitation, setInvitation] = useState<InvitationLookupRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const token = searchParams.get('token') ?? ''

  useEffect(() => {
    let ignore = false

    async function loadInvitation() {
      if (!token) {
        setErrorMessage('La invitacion no tiene un token valido.')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setErrorMessage(null)

      try {
        const nextInvitation = await getInvitationByToken(token)

        if (!ignore) {
          if (!nextInvitation) {
            setErrorMessage('No encontramos una invitacion pendiente para este link.')
          } else if (nextInvitation.status !== 'pending') {
            setErrorMessage('Esta invitacion ya fue aceptada o ya no esta disponible.')
          } else {
            setInvitation(nextInvitation)
          }
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(getErrorMessage(error))
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    void loadInvitation()

    return () => {
      ignore = true
    }
  }, [token])

  async function handleAccept() {
    if (!user?.email || !invitation) {
      return
    }

    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      setErrorMessage(
        `Esta invitacion fue enviada a ${invitation.email}. Inicia sesion con ese email para aceptarla.`,
      )
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      await acceptInvitation({
        invitation,
        userId: user.id,
        userEmail: user.email,
      })

      setSuccessMessage(
        invitation.listId
          ? 'Ya formas parte de la lista compartida.'
          : 'Ya tienes acceso a las entradas compartidas.',
      )
      navigate(invitation.listId ? `/lists/${invitation.listId}` : '/', {
        replace: true,
      })
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page">
      <article className="card">
        <div className="section-title">
          <h1>{getInvitationTitle(invitation)}</h1>
          <p>{getInvitationDescription(invitation)}</p>
        </div>

        {isLoading ? <p className="muted">Buscando invitacion...</p> : null}
        {errorMessage ? <p className="feedback feedback--error">{errorMessage}</p> : null}
        {successMessage ? (
          <p className="feedback feedback--success">{successMessage}</p>
        ) : null}

        {!isLoading && invitation ? (
          <div className="detail-facts">
            <div className="detail-fact">
              <span>{invitation.listId ? 'Lista' : 'Acceso'}</span>
              <strong>
                {invitation.listId
                  ? invitation.listName || 'Lista compartida'
                  : 'Entradas compartidas'}
              </strong>
            </div>
            <div className="detail-fact">
              <span>Invitado</span>
              <strong>{invitation.email}</strong>
            </div>
          </div>
        ) : null}

        <div className="entry-form__actions">
          {invitation?.status === 'pending' ? (
            <button
              type="button"
              className="button"
              disabled={isSubmitting || !user}
              onClick={() => {
                void handleAccept()
              }}
            >
              {isSubmitting ? 'Aceptando...' : 'Accept invitation'}
            </button>
          ) : null}

          <Link className="button--ghost" to="/">
            Ir al inicio
          </Link>
        </div>
      </article>
    </section>
  )
}
