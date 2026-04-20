import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-context'
import { entryTypeOptions } from '@/features/entries/config/entry-type-config'
import { deleteEntry, listEntries } from '@/features/entries/entries-api'
import { NotificationsBell } from '@/features/sharing/components/NotificationsBell'
import { ShareEntriesModal } from '@/features/sharing/components/ShareEntriesModal'
import {
  listSentEntriesShareInvitations,
  listEntryUserMarks,
  upsertEntryUserMark,
} from '@/features/sharing/sharing-api'
import type { EntryRecord, EntryType, EntryUserMarkRecord } from '@/types/entries'
import type { InvitationRecord } from '@/types/lists'

type EntryTypeFilter = 'all' | EntryType

const PAGE_SIZE = 20

const typeLabelMap = entryTypeOptions.reduce<Record<EntryType, string>>(
  (labels, option) => {
    labels[option.type] = option.label
    return labels
  },
  {} as Record<EntryType, string>,
)

function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
  }).format(new Date(date))
}

function getEntrySearchText(entry: EntryRecord) {
  return [
    entry.title,
    entry.summary,
    entry.type,
    entry.sourceName ?? '',
    entry.sourceUrl ?? '',
    entry.uploaderName ?? '',
    entry.uploaderEmail ?? '',
    entry.sourceType,
    entry.aiTags.join(' '),
    entry.metadata.author ?? '',
    entry.metadata.director ?? '',
    entry.metadata.cast ?? '',
    entry.metadata.genre ?? '',
    entry.metadata.platform ?? '',
    entry.metadata.topic ?? '',
    entry.metadata.note ?? '',
  ]
    .join(' ')
    .toLowerCase()
}

function getRowMeta(entry: EntryRecord) {
  if (entry.sourceType === 'link' && entry.sourceUrl) {
    return entry.sourceName
      ? `${entry.sourceName} - ${entry.sourceUrl}`
      : entry.sourceUrl
  }

  if (entry.type === 'movie' || entry.type === 'series') {
    return [entry.metadata.platform, entry.metadata.genre]
      .filter(Boolean)
      .join(' - ')
  }

  if (entry.type === 'article') {
    return entry.sourceName || entry.aiTags.slice(0, 2).join(' - ')
  }

  if (entry.type === 'book') {
    return entry.metadata.author ?? ''
  }

  if (entry.type === 'event') {
    return [entry.metadata.date, entry.metadata.location]
      .filter(Boolean)
      .join(' - ')
  }

  if (entry.type === 'place' || entry.type === 'trip' || entry.type === 'plant') {
    return [entry.metadata.location, entry.metadata.date]
      .filter(Boolean)
      .join(' - ')
  }

  if (entry.type === 'garden' || entry.type === 'collection') {
    return entry.metadata.topic ?? ''
  }

  if (entry.aiTags.length > 0) {
    return entry.aiTags.slice(0, 2).join(' - ')
  }

  return entry.sourceName ?? entry.sourceType
}

function getUploaderLabel(entry: EntryRecord, currentUserId?: string) {
  if (entry.userId === currentUserId) {
    return 'Vos'
  }

  return entry.uploaderName ?? entry.uploaderEmail ?? entry.userId
}

export function EntriesHomePage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<EntryRecord[]>([])
  const [entryMarksById, setEntryMarksById] = useState<Record<string, EntryUserMarkRecord>>({})
  const [sharedInvitations, setSharedInvitations] = useState<InvitationRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeType, setActiveType] = useState<EntryTypeFilter>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [isShareOpen, setIsShareOpen] = useState(false)

  useEffect(() => {
    let ignore = false

    async function loadEntries() {
      if (!user) return

      setIsLoading(true)
      setErrorMessage(null)

      try {
        const nextEntries = await listEntries()

        if (!ignore) {
          setEntries(nextEntries)
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'No pudimos cargar tu archivo.',
          )
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    void loadEntries()

    return () => {
      ignore = true
    }
  }, [user])

  useEffect(() => {
    let ignore = false

    async function loadMarks() {
      if (!user || entries.length === 0) {
        if (!ignore) {
          setEntryMarksById({})
        }
        return
      }

      try {
        const marks = await listEntryUserMarks(
          user.id,
          entries.map((entry) => entry.id),
        )

        if (!ignore) {
          setEntryMarksById(
            marks.reduce<Record<string, EntryUserMarkRecord>>((accumulator, mark) => {
              accumulator[mark.entryId] = mark
              return accumulator
            }, {}),
          )
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'No pudimos cargar tus marcas personales.',
          )
        }
      }
    }

    void loadMarks()

    return () => {
      ignore = true
    }
  }, [entries, user])

  useEffect(() => {
    let ignore = false

    async function loadSharedPeople() {
      if (!user) {
        if (!ignore) {
          setSharedInvitations([])
        }
        return
      }

      try {
        const nextInvitations = await listSentEntriesShareInvitations(user.id)

        if (!ignore) {
          setSharedInvitations(nextInvitations)
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'No pudimos cargar con quien estas compartiendo.',
          )
        }
      }
    }

    void loadSharedPeople()

    return () => {
      ignore = true
    }
  }, [user])

  const filteredEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return entries.filter((entry) => {
      const matchesType = activeType === 'all' || entry.type === activeType
      const matchesQuery =
        normalizedQuery.length === 0 ||
        getEntrySearchText(entry).includes(normalizedQuery)

      return matchesType && matchesQuery
    })
  }, [activeType, entries, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const acceptedShares = sharedInvitations.filter(
    (invitation) => invitation.status === 'accepted',
  )
  const pendingShares = sharedInvitations.filter(
    (invitation) => invitation.status === 'pending',
  )

  const paginatedEntries = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * PAGE_SIZE
    return filteredEntries.slice(startIndex, startIndex + PAGE_SIZE)
  }, [filteredEntries, safeCurrentPage])

  async function handleDelete(entry: EntryRecord) {
    if (!user) return

    const confirmed = window.confirm(
      `Vas a borrar "${entry.title}". Esta accion no se puede deshacer.`,
    )

    if (!confirmed) return

    setDeletingId(entry.id)
    setErrorMessage(null)

    try {
      await deleteEntry(entry.id)
      setEntries((currentEntries) =>
        currentEntries.filter((currentEntry) => currentEntry.id !== entry.id),
      )
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos borrar este item.',
      )
    } finally {
      setDeletingId(null)
    }
  }

  async function handleToggleMark(entry: EntryRecord) {
    if (!user) return

    const currentMark = entryMarksById[entry.id]
    const nextChecked = !currentMark?.isChecked

    setMarkingId(entry.id)

    try {
      const nextMark = await upsertEntryUserMark({
        entryId: entry.id,
        userId: user.id,
        isChecked: nextChecked,
      })

      setEntryMarksById((currentMarks) => ({
        ...currentMarks,
        [entry.id]: nextMark,
      }))
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos actualizar tu marca personal.',
      )
    } finally {
      setMarkingId(null)
    }
  }

  return (
    <section className="page page--library">
      <header className="library-header">
        <div />

        <div className="library-header__actions">
          <NotificationsBell />

          {user ? (
            <button
              type="button"
              className="button--ghost"
              onClick={() => {
                setIsShareOpen(true)
              }}
            >
              Share with
            </button>
          ) : null}

          <Link className="button library-header__cta" to="/entries/new">
            Agregar algo
          </Link>
        </div>
      </header>

      <section className="library-toolbar">
        <label className="search-field">
          <span className="sr-only">Buscar en tu archivo</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Buscar por titulo, autor, genero o plataforma"
            onChange={(event) => {
              setSearchQuery(event.target.value)
              setCurrentPage(1)
            }}
          />
        </label>

        <div className="filter-row" aria-label="Filtrar por tipo">
          <button
            type="button"
            className={
              activeType === 'all'
                ? 'filter-chip filter-chip--active'
                : 'filter-chip'
            }
            onClick={() => {
              setActiveType('all')
              setCurrentPage(1)
            }}
          >
            Todo
          </button>

          {entryTypeOptions.map((option) => (
            <button
              key={option.type}
              type="button"
              className={
                activeType === option.type
                  ? 'filter-chip filter-chip--active'
                  : 'filter-chip'
              }
                onClick={() => {
                  setActiveType(option.type)
                  setCurrentPage(1)
                }}
              >
                {option.label}
            </button>
          ))}
        </div>
      </section>

      {user ? (
        <section className="share-summary" aria-label="Personas con acceso compartido">
          <div className="share-summary__header">
            <h2>Compartiendo con</h2>
            <span>
              {acceptedShares.length} activas · {pendingShares.length} pendientes
            </span>
          </div>

          {sharedInvitations.length === 0 ? (
            <p className="share-summary__empty">
              Todavia no compartiste tus entradas con nadie.
            </p>
          ) : (
            <div className="share-summary__list">
              {sharedInvitations.map((invitation) => (
                <article className="share-person-card" key={invitation.id}>
                  <div className="share-person-card__copy">
                    <strong>{invitation.email}</strong>
                    <span>
                      {invitation.status === 'accepted'
                        ? 'Acceso activo'
                        : 'Invitacion pendiente'}
                    </span>
                  </div>

                  <span
                    className={
                      invitation.status === 'accepted'
                        ? 'share-person-card__status share-person-card__status--active'
                        : 'share-person-card__status'
                    }
                  >
                    {invitation.status === 'accepted' ? 'Activo' : 'Pendiente'}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {errorMessage ? <p className="feedback feedback--error">{errorMessage}</p> : null}

      {isLoading ? (
        <article className="card card--flat">
          <h2>Cargando tu archivo</h2>
          <p>Estamos trayendo tus cosas guardadas.</p>
        </article>
      ) : entries.length === 0 ? (
        <article className="card card--flat empty-state">
          <h2>Todavia no guardaste nada</h2>
          <p>
            Empeza con una captura. La idea es que no tengas que mandarte cosas a
            WhatsApp para recordarlas despues.
          </p>
          <Link className="button" to="/entries/new">
            Subir primera captura
          </Link>
        </article>
      ) : filteredEntries.length === 0 ? (
        <article className="card card--flat empty-state">
          <h2>No encontramos resultados</h2>
          <p>Proba otro texto o cambia el filtro de tipo.</p>
        </article>
      ) : (
        <section className="library-table" aria-label="Items guardados">
          <div className="library-table__head" aria-hidden="true">
            <span>Item</span>
            <span>Tipo</span>
            <span>Subio</span>
            <span>Actualizado</span>
            <span>Marca</span>
          </div>

          <div className="library-table__body">
            {paginatedEntries.map((entry) => {
              const rowMeta = getRowMeta(entry)
              const uploaderLabel = getUploaderLabel(entry, user?.id)
              const isChecked = entryMarksById[entry.id]?.isChecked ?? false

              return (
                <article className="library-row" key={entry.id}>
                  <Link className="library-row__main" to={`/entries/${entry.id}`}>
                    <div className="library-row__content">
                      <h2>{entry.title}</h2>
                      <p>{entry.summary || rowMeta || 'Sin descripcion todavia.'}</p>
                    </div>

                    <span className="library-row__type">
                      {typeLabelMap[entry.type]}
                    </span>

                    <div className="library-row__uploader">
                      <span>{uploaderLabel}</span>
                    </div>

                    <div className="library-row__side">
                      <span>{formatDate(entry.updatedAt)}</span>
                      {rowMeta ? <small>{rowMeta}</small> : null}
                    </div>
                  </Link>

                  <div className="library-row__actions">
                    <label className="entry-mark-toggle">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={markingId === entry.id}
                        onChange={() => {
                          void handleToggleMark(entry)
                        }}
                      />
                      <span>{isChecked ? 'Ya lo vi' : 'Marcar'}</span>
                    </label>

                    <button
                      type="button"
                      className="button--subtle-danger"
                      disabled={deletingId === entry.id}
                      onClick={() => {
                        void handleDelete(entry)
                      }}
                    >
                      {deletingId === entry.id ? 'Borrando...' : 'Borrar'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          {totalPages > 1 ? (
            <div className="pagination" aria-label="Paginacion de entradas">
              <button
                type="button"
                className="button--ghost"
                disabled={safeCurrentPage === 1}
                onClick={() => {
                  setCurrentPage((page) => Math.max(1, page - 1))
                }}
              >
                Anterior
              </button>

              <span className="pagination__status">
                Pagina {safeCurrentPage} de {totalPages} - {filteredEntries.length} entradas
              </span>

              <button
                type="button"
                className="button--ghost"
                disabled={safeCurrentPage === totalPages}
                onClick={() => {
                  setCurrentPage((page) => Math.min(totalPages, page + 1))
                }}
              >
                Siguiente
              </button>
            </div>
          ) : null}
        </section>
      )}

      {user ? (
        <ShareEntriesModal
          isOpen={isShareOpen}
          currentUserId={user.id}
          onSuccess={async () => {
            const nextInvitations = await listSentEntriesShareInvitations(user.id)
            setSharedInvitations(nextInvitations)
          }}
          onClose={() => {
            setIsShareOpen(false)
          }}
        />
      ) : null}
    </section>
  )
}
