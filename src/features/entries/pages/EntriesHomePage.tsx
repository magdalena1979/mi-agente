import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-context'
import { entryTypeOptions } from '@/features/entries/config/entry-type-config'
import { deleteEntry, listEntries } from '@/features/entries/entries-api'
import type { EntryRecord, EntryType } from '@/types/entries'

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

export function EntriesHomePage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<EntryRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeType, setActiveType] = useState<EntryTypeFilter>('all')
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    let ignore = false

    async function loadEntries() {
      if (!user) return

      setIsLoading(true)
      setErrorMessage(null)

      try {
        const nextEntries = await listEntries(user.id)

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
      await deleteEntry(entry.id, user.id)
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

  return (
    <section className="page page--library">
      <header className="library-header">
        <div className="section-title">
          <h1>The things you share with .</h1>
          <p>Agrega una captura</p>
        </div>

        <Link className="button library-header__cta" to="/entries/new">
          Agregar algo
        </Link>
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
            <span>Actualizado</span>
          </div>

          <div className="library-table__body">
            {paginatedEntries.map((entry) => {
              const rowMeta = getRowMeta(entry)

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

                    <div className="library-row__side">
                      <span>{formatDate(entry.updatedAt)}</span>
                      {rowMeta ? <small>{rowMeta}</small> : null}
                    </div>
                  </Link>

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
    </section>
  )
}
