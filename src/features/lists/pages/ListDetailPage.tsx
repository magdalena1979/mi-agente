import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-context'
import { listEntriesForList } from '@/features/entries/entries-api'
import { entryTypeOptions } from '@/features/entries/config/entry-type-config'
import { ShareListModal } from '@/features/lists/components/ShareListModal'
import { getList } from '@/features/lists/lists-api'
import type { EntryRecord } from '@/types/entries'
import type { ListRecord } from '@/types/lists'

const entryTypeLabelMap = entryTypeOptions.reduce<Record<string, string>>(
  (labels, option) => {
    labels[option.type] = option.label
    return labels
  },
  {},
)

function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))
}

function getEntrySecondaryMeta(entry: EntryRecord) {
  if (entry.type === 'movie' || entry.type === 'series') {
    return [entry.metadata.platform, entry.metadata.genre]
      .filter(Boolean)
      .join(' - ')
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

  return entry.sourceName ?? entry.sourceType
}

export function ListDetailPage() {
  const { listId } = useParams()
  const { user } = useAuth()
  const [list, setList] = useState<ListRecord | null>(null)
  const [entries, setEntries] = useState<EntryRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isShareOpen, setIsShareOpen] = useState(false)

  async function loadCurrentList() {
    if (!listId) {
      return
    }

    const [nextList, nextEntries] = await Promise.all([
      getList(listId),
      listEntriesForList(listId),
    ])

    setList(nextList)
    setEntries(nextEntries)
  }

  useEffect(() => {
    let ignore = false

    async function load() {
      if (!listId) return

      setIsLoading(true)
      setErrorMessage(null)

      try {
        const [nextList, nextEntries] = await Promise.all([
          getList(listId),
          listEntriesForList(listId),
        ])

        if (!ignore) {
          setList(nextList)
          setEntries(nextEntries)
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'No pudimos cargar la lista.',
          )
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      ignore = true
    }
  }, [listId])

  const isOwner = Boolean(user && list && list.ownerId === user.id)

  if (isLoading) {
    return (
      <section className="page">
        <article className="card">
          <h2>Cargando lista</h2>
          <p>Estamos preparando tu espacio compartido.</p>
        </article>
      </section>
    )
  }

  if (!list) {
    return (
      <section className="page">
        <article className="card">
          <h2>Lista no disponible</h2>
          <p>{errorMessage ?? 'No encontramos esta lista.'}</p>
          <div className="entry-form__actions">
            <Link className="button" to="/">
              Volver
            </Link>
          </div>
        </article>
      </section>
    )
  }

  return (
    <section className="page page--detail">
      <div className="detail-back-row">
        <Link className="detail-back-link" to="/">
          <span aria-hidden="true">←</span>
          <span>Volver</span>
        </Link>
      </div>

      <article className="detail-hero">
        <div className="detail-hero__content">
          <div className="detail-hero__eyebrow">
            <span className="entry-card__type">
              {isOwner ? 'Owner' : 'Shared'}
            </span>
            <span className="detail-chip">
              {list.members.length} miembros
            </span>
          </div>

          <h1>{list.name}</h1>
          <p>
            {entries.length} entradas guardadas en esta lista. Usa el boton de
            abajo para agregar nuevas capturas o compartir la lista.
          </p>
        </div>

        <div className="detail-hero__actions">
          <Link className="button" to="/entries/new">
            Agregar entrada
          </Link>
          <button
            type="button"
            className="button--ghost"
            disabled={!isOwner}
            onClick={() => {
              setIsShareOpen(true)
            }}
          >
            Share with
          </button>
        </div>
      </article>

      <div className="detail-layout">
        <div className="detail-layout__main">
          <article className="card">
            <div className="section-title">
              <h2>Entradas</h2>
              <p>Todo lo que esta compartido dentro de esta lista.</p>
            </div>

            {entries.length === 0 ? (
              <p className="muted">Todavia no hay entradas en esta lista.</p>
            ) : (
              <div className="library-table__body">
                {entries.map((entry) => (
                  <article className="library-row" key={entry.id}>
                    <Link className="library-row__main" to={`/entries/${entry.id}`}>
                      <div className="library-row__content">
                        <div className="library-row__meta-group">
                          <span className="library-row__type">
                            {entryTypeLabelMap[entry.type] ?? entry.type}
                          </span>
                        </div>

                        <h2>{entry.title}</h2>
                        <p>
                          {entry.summary ||
                            getEntrySecondaryMeta(entry) ||
                            'Sin descripcion todavia.'}
                        </p>

                        <div className="library-row__details">
                          <span>{formatDate(entry.updatedAt)}</span>
                          {getEntrySecondaryMeta(entry) ? (
                            <span>{getEntrySecondaryMeta(entry)}</span>
                          ) : null}
                        </div>
                      </div>

                      <span className="library-row__chevron" aria-hidden="true">
                        &#8250;
                      </span>
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </article>
        </div>

        <aside className="detail-layout__side">
          <article className="card">
            <div className="section-title">
              <h2>Miembros</h2>
              <p>Quienes ya forman parte de esta lista.</p>
            </div>

            <div className="detail-facts">
              {list.members.map((member) => (
                <div key={member.id} className="detail-fact">
                  <span>{member.role}</span>
                  <strong>{member.email ?? member.userId}</strong>
                </div>
              ))}
            </div>

            {list.pendingInvitations.length > 0 ? (
              <>
                <div className="section-title">
                  <h2>Invitaciones pendientes</h2>
                </div>
                <div className="detail-facts">
                  {list.pendingInvitations.map((invitation) => (
                    <div key={invitation.id} className="detail-fact">
                      <span>pending</span>
                      <strong>{invitation.email}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </article>
        </aside>
      </div>

      {user ? (
        <ShareListModal
          isOpen={isShareOpen}
          list={list}
          currentUserId={user.id}
          onClose={() => {
            setIsShareOpen(false)
          }}
          onSuccess={async () => {
            await loadCurrentList()
          }}
        />
      ) : null}
    </section>
  )
}
