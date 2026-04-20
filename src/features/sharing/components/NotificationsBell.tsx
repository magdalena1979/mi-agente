import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-context'
import { listPendingInvitations } from '@/features/lists/lists-api'
import {
  listUnreadEntryNotifications,
  markEntryNotificationAsRead,
} from '@/features/sharing/sharing-api'
import type { EntryNotificationRecord } from '@/types/entries'
import type { InvitationLookupRecord } from '@/types/lists'

function getInvitationLabel(invitation: InvitationLookupRecord) {
  if (invitation.listId) {
    return invitation.listName ?? 'Lista compartida'
  }

  return 'Acceso a entradas compartidas'
}

function getEntryNotificationLabel(notification: EntryNotificationRecord) {
  return notification.entryTitle
    ? `Nueva entrada: ${notification.entryTitle}`
    : 'Nueva entrada compartida'
}

export function NotificationsBell() {
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [invitationNotifications, setInvitationNotifications] = useState<
    InvitationLookupRecord[]
  >([])
  const [entryNotifications, setEntryNotifications] = useState<
    EntryNotificationRecord[]
  >([])

  useEffect(() => {
    let ignore = false

    async function loadNotifications() {
      if (!user?.email) {
        if (!ignore) {
          setInvitationNotifications([])
          setEntryNotifications([])
        }
        return
      }

      setIsLoading(true)
      setErrorMessage(null)

      try {
        const [nextInvitations, nextEntryNotifications] = await Promise.all([
          listPendingInvitations(user.email),
          listUnreadEntryNotifications(user.id),
        ])

        if (!ignore) {
          setInvitationNotifications(nextInvitations)
          setEntryNotifications(nextEntryNotifications)
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'No pudimos cargar tus notificaciones.',
          )
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    void loadNotifications()

    return () => {
      ignore = true
    }
  }, [user?.email, user?.id])

  if (!user) {
    return null
  }

  const notificationCount =
    invitationNotifications.length + entryNotifications.length

  return (
    <div className="notification-bell">
      <button
        type="button"
        className="button--ghost icon-button"
        aria-label="Notificaciones"
        onClick={() => {
          setIsOpen((open) => !open)
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-button__icon">
          <path
            d="M12 3.75a4.5 4.5 0 0 0-4.5 4.5v2.18c0 .7-.2 1.39-.58 1.98L5.87 14a1.5 1.5 0 0 0 1.26 2.33h9.74A1.5 1.5 0 0 0 18.13 14l-1.05-1.59a3.6 3.6 0 0 1-.58-1.98V8.25a4.5 4.5 0 0 0-4.5-4.5Zm0 16.5a2.25 2.25 0 0 1-2.12-1.5h4.24A2.25 2.25 0 0 1 12 20.25Z"
            fill="currentColor"
          />
        </svg>
        {notificationCount > 0 ? (
          <span className="notification-badge">{notificationCount}</span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="notification-panel">
          <div className="notification-panel__header">
            <strong>Notificaciones</strong>
          </div>

          {isLoading ? <p className="muted">Cargando notificaciones...</p> : null}
          {errorMessage ? <p className="feedback feedback--error">{errorMessage}</p> : null}

          {!isLoading && notificationCount === 0 ? (
            <p className="muted">No tienes notificaciones pendientes.</p>
          ) : null}

          <div className="notification-list">
            {entryNotifications.map((notification) => (
              <article key={notification.id} className="notification-item">
                <div className="notification-item__copy">
                  <strong>{getEntryNotificationLabel(notification)}</strong>
                  <span>
                    {notification.actorLabel
                      ? `${notification.actorLabel} subio algo nuevo`
                      : 'Hay una entrada nueva compartida'}
                  </span>
                </div>

                <Link
                  className="button--ghost button--compact"
                  to={notification.entryId ? `/entries/${notification.entryId}` : '/'}
                  onClick={() => {
                    void markEntryNotificationAsRead(notification.id)
                    setEntryNotifications((currentNotifications) =>
                      currentNotifications.filter(
                        (currentNotification) =>
                          currentNotification.id !== notification.id,
                      ),
                    )
                    setIsOpen(false)
                  }}
                >
                  Ver
                </Link>
              </article>
            ))}

            {invitationNotifications.map((notification) => (
              <article key={notification.id} className="notification-item">
                <div className="notification-item__copy">
                  <strong>{getInvitationLabel(notification)}</strong>
                  <span>{notification.email}</span>
                </div>

                <Link
                  className="button--ghost button--compact"
                  to={`/accept-invite?token=${notification.token}`}
                  onClick={() => {
                    setIsOpen(false)
                  }}
                >
                  Ver
                </Link>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
