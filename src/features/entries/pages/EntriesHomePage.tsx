import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  createManyUserCategories,
  createUserCategory,
  deleteUserCategory,
  listEntryUserCategories,
  listUserCategories,
} from '@/features/categories/categories-api'
import { CreateUserCategoryModal } from '@/features/categories/components/CreateUserCategoryModal'
import { ManageUserCategoriesModal } from '@/features/categories/components/ManageUserCategoriesModal'
import { UserCategorySetupModal } from '@/features/categories/components/UserCategorySetupModal'
import { useAuth } from '@/features/auth/auth-context'
import { DEFAULT_USER_CATEGORY_NAMES, type UserCategoryRecord } from '@/types/categories'
import { entryTypeOptions } from '@/features/entries/config/entry-type-config'
import { deleteEntry, listEntries } from '@/features/entries/entries-api'
import { NotificationsBell } from '@/features/sharing/components/NotificationsBell'
import { ShareEntriesModal } from '@/features/sharing/components/ShareEntriesModal'
import {
  listSentEntriesShareInvitations,
  listEntryUserMarks,
  revokeEntriesShare,
  upsertEntryUserMark,
} from '@/features/sharing/sharing-api'
import type { EntryRecord, EntryType, EntryUserMarkRecord } from '@/types/entries'
import type { InvitationRecord } from '@/types/lists'

type HomeDesktopTab = 'entries' | 'sharing'

const PAGE_SIZE = 20
const CATEGORY_SETUP_STORAGE_PREFIX = 'user-category-setup-completed:'

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

function getCategorySetupStorageKey(userId: string) {
  return `${CATEGORY_SETUP_STORAGE_PREFIX}${userId}`
}

function readHasCompletedCategorySetup(userId: string) {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(getCategorySetupStorageKey(userId)) === 'true'
}

function writeHasCompletedCategorySetup(userId: string) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(getCategorySetupStorageKey(userId), 'true')
}

export function EntriesHomePage() {
  const { user } = useAuth()
  const suggestedCategoryNames = useMemo(() => [...DEFAULT_USER_CATEGORY_NAMES], [])
  const [entries, setEntries] = useState<EntryRecord[]>([])
  const [entryMarksById, setEntryMarksById] = useState<Record<string, EntryUserMarkRecord>>({})
  const [sharedInvitations, setSharedInvitations] = useState<InvitationRecord[]>([])
  const [userCategories, setUserCategories] = useState<UserCategoryRecord[]>([])
  const [entryCategoryIdsByEntryId, setEntryCategoryIdsByEntryId] = useState<Record<string, string[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [revokingInvitationId, setRevokingInvitationId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState<'all' | string>('all')
  const [showUncheckedOnly, setShowUncheckedOnly] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [activeDesktopTab, setActiveDesktopTab] = useState<HomeDesktopTab>('entries')
  const [isCreateCategoryModalOpen, setIsCreateCategoryModalOpen] = useState(false)
  const [isSavingCategory, setIsSavingCategory] = useState(false)
  const [isManageCategoriesModalOpen, setIsManageCategoriesModalOpen] = useState(false)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)
  const [categoryErrorMessage, setCategoryErrorMessage] = useState<string | null>(null)
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false)
  const [isSavingCategorySetup, setIsSavingCategorySetup] = useState(false)

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

    async function loadUserCategories() {
      if (!user) {
        if (!ignore) {
          setUserCategories([])
          setEntryCategoryIdsByEntryId({})
        }
        return
      }

      try {
        const nextCategories = await listUserCategories(user.id)

        if (!ignore) {
          setUserCategories(nextCategories)

          if (nextCategories.length > 0) {
            writeHasCompletedCategorySetup(user.id)
          }
        }
      } catch (error) {
        if (!ignore) {
          setCategoryErrorMessage(
            error instanceof Error
              ? error.message
              : 'No pudimos cargar tus subcategorias personales.',
          )
        }
      }
    }

    void loadUserCategories()

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

    async function loadEntryCategories() {
      if (!user || entries.length === 0) {
        if (!ignore) {
          setEntryCategoryIdsByEntryId({})
        }
        return
      }

      try {
        const assignments = await listEntryUserCategories(
          user.id,
          entries.map((entry) => entry.id),
        )

        if (!ignore) {
          setEntryCategoryIdsByEntryId(
            assignments.reduce<Record<string, string[]>>((accumulator, assignment) => {
              accumulator[assignment.entryId] = [
                ...(accumulator[assignment.entryId] ?? []),
                assignment.userCategoryId,
              ]

              return accumulator
            }, {}),
          )
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'No pudimos cargar las categorias de tus entries.',
          )
        }
      }
    }

    void loadEntryCategories()

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
      const matchesCategory =
        activeCategoryId === 'all' ||
        (entryCategoryIdsByEntryId[entry.id] ?? []).includes(activeCategoryId)
      const isChecked = entryMarksById[entry.id]?.isChecked ?? false
      const matchesMark = !showUncheckedOnly || !isChecked
      const matchesQuery =
        normalizedQuery.length === 0 ||
        getEntrySearchText(entry).includes(normalizedQuery)

      return matchesCategory && matchesMark && matchesQuery
    })
  }, [activeCategoryId, entries, entryCategoryIdsByEntryId, entryMarksById, searchQuery, showUncheckedOnly])

  useEffect(() => {
    if (
      activeCategoryId !== 'all' &&
      !userCategories.some((category) => category.id === activeCategoryId)
    ) {
      setActiveCategoryId('all')
    }
  }, [activeCategoryId, userCategories])

  useEffect(() => {
    if (!user) {
      setIsSetupModalOpen(false)
      return
    }

    const didCompleteSetup = readHasCompletedCategorySetup(user.id)

    if (userCategories.length === 0 && !didCompleteSetup) {
      setIsSetupModalOpen(true)
    }
  }, [user, userCategories.length])

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

  async function handleRevokeShare(invitation: InvitationRecord) {
    const actionLabel =
      invitation.status === 'accepted'
        ? `dejar de compartir con ${invitation.email}`
        : `cancelar la invitacion para ${invitation.email}`

    const confirmed = window.confirm(
      `Vas a ${actionLabel}. Esta accion no elimina la cuenta de la otra persona.`,
    )

    if (!confirmed) {
      return
    }

    setRevokingInvitationId(invitation.id)
    setErrorMessage(null)

    try {
      await revokeEntriesShare(invitation.id)
      setSharedInvitations((currentInvitations) =>
        currentInvitations.filter(
          (currentInvitation) => currentInvitation.id !== invitation.id,
        ),
      )
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos actualizar esta relacion compartida.',
      )
    } finally {
      setRevokingInvitationId(null)
    }
  }

  async function refreshUserCategories() {
    if (!user) {
      return []
    }

    const nextCategories = await listUserCategories(user.id)
    setUserCategories(nextCategories)
    return nextCategories
  }

  async function refreshEntryCategoryAssignments() {
    if (!user || entries.length === 0) {
      setEntryCategoryIdsByEntryId({})
      return {}
    }

    const assignments = await listEntryUserCategories(
      user.id,
      entries.map((entry) => entry.id),
    )
    const nextAssignments = assignments.reduce<Record<string, string[]>>((accumulator, assignment) => {
      accumulator[assignment.entryId] = [
        ...(accumulator[assignment.entryId] ?? []),
        assignment.userCategoryId,
      ]

      return accumulator
    }, {})

    setEntryCategoryIdsByEntryId(nextAssignments)
    return nextAssignments
  }

  async function handleCreateCategory(name: string) {
    if (!user) {
      return
    }

    setIsSavingCategory(true)
    setCategoryErrorMessage(null)

    try {
      const nextCategory = await createUserCategory({
        userId: user.id,
        name,
      })

      setUserCategories((currentCategories) =>
        [...currentCategories, nextCategory].sort((leftCategory, rightCategory) =>
          leftCategory.name.localeCompare(rightCategory.name),
        ),
      )
      setActiveCategoryId(nextCategory.id)
      setIsCreateCategoryModalOpen(false)
    } catch (error) {
      setCategoryErrorMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos guardar esta subcategoria personal.',
      )
    } finally {
      setIsSavingCategory(false)
    }
  }

  async function handleSetupCategories(input: {
    selectedNames: string[]
    customName: string
  }) {
    if (!user) {
      return
    }

    setIsSavingCategorySetup(true)
    setCategoryErrorMessage(null)

    try {
      await createManyUserCategories({
        userId: user.id,
        names: [...input.selectedNames, input.customName],
      })

      const nextCategories = await refreshUserCategories()

      writeHasCompletedCategorySetup(user.id)
      setIsSetupModalOpen(false)

      if (nextCategories[0]) {
        setActiveCategoryId(nextCategories[0].id)
      }
    } catch (error) {
      setCategoryErrorMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos guardar tus subcategorias personales.',
      )
    } finally {
      setIsSavingCategorySetup(false)
    }
  }

  async function handleDeleteCategory(category: UserCategoryRecord) {
    if (!user) {
      return
    }

    const confirmed = window.confirm(
      `Vas a borrar "${category.name}" de tus subcategorias. Tambien se va a sacar de las entries donde la estabas usando.`,
    )

    if (!confirmed) {
      return
    }

    setDeletingCategoryId(category.id)
    setCategoryErrorMessage(null)

    try {
      await deleteUserCategory({
        userId: user.id,
        categoryId: category.id,
      })

      const nextCategories = await refreshUserCategories()
      await refreshEntryCategoryAssignments()

      if (!nextCategories.some((currentCategory) => currentCategory.id === activeCategoryId)) {
        setActiveCategoryId('all')
      }
    } catch (error) {
      setCategoryErrorMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos borrar esta subcategoria personal.',
      )
    } finally {
      setDeletingCategoryId(null)
    }
  }

  return (
    <section className="page page--library">
      <CreateUserCategoryModal
        isOpen={isCreateCategoryModalOpen}
        isSubmitting={isSavingCategory}
        errorMessage={categoryErrorMessage}
        onClose={() => {
          setIsCreateCategoryModalOpen(false)
          setCategoryErrorMessage(null)
        }}
        onSubmit={handleCreateCategory}
      />

      <ManageUserCategoriesModal
        isOpen={isManageCategoriesModalOpen}
        categories={userCategories}
        deletingCategoryId={deletingCategoryId}
        errorMessage={categoryErrorMessage}
        onClose={() => {
          setIsManageCategoriesModalOpen(false)
          setCategoryErrorMessage(null)
        }}
        onDelete={handleDeleteCategory}
      />

      <UserCategorySetupModal
        isOpen={isSetupModalOpen}
        suggestedNames={suggestedCategoryNames}
        isSubmitting={isSavingCategorySetup}
        errorMessage={categoryErrorMessage}
        onClose={() => {
          if (user) {
            writeHasCompletedCategorySetup(user.id)
          }
          setIsSetupModalOpen(false)
          setCategoryErrorMessage(null)
        }}
        onSubmit={handleSetupCategories}
      />

      <header className="library-header">
        <div className="library-header__main">
          <div className="section-title">
            <h1>{activeDesktopTab === 'entries' ? 'Biblioteca' : 'Compartido'}</h1>
            <p>
              {activeDesktopTab === 'entries'
                ? 'Tus capturas, links y recomendaciones en una lista clara y fácil de explorar.'
                : 'Invitaciones activas y accesos compartidos en un solo lugar.'}
            </p>
          </div>

          <div className="library-tabs" aria-label="Secciones principales">
            <button
              type="button"
              className={
                activeDesktopTab === 'entries'
                  ? 'library-tab library-tab--active'
                  : 'library-tab'
              }
              onClick={() => {
                setActiveDesktopTab('entries')
              }}
            >
              Archivo
            </button>
            <button
              type="button"
              className={
                activeDesktopTab === 'sharing'
                  ? 'library-tab library-tab--active'
                  : 'library-tab'
              }
              onClick={() => {
                setActiveDesktopTab('sharing')
              }}
            >
              Share with
            </button>
          </div>
        </div>

        <div className="library-header__actions">
          <NotificationsBell />

          {user ? (
            <button
              type="button"
              className="button--ghost library-share-trigger"
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

      {errorMessage ? <p className="feedback feedback--error">{errorMessage}</p> : null}

      {activeDesktopTab === 'entries' ? (
        <>
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

            <div className="filter-row" aria-label="Filtrar por subcategoria personal">
              <button
                type="button"
                className={
                  activeCategoryId === 'all'
                    ? 'filter-chip filter-chip--active'
                    : 'filter-chip'
                }
                onClick={() => {
                  setActiveCategoryId('all')
                  setCurrentPage(1)
                }}
              >
                Todo
              </button>

              {userCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={
                    activeCategoryId === category.id
                      ? 'filter-chip filter-chip--active'
                      : 'filter-chip'
                  }
                  onClick={() => {
                    setActiveCategoryId(category.id)
                    setCurrentPage(1)
                  }}
                >
                  {category.name}
                </button>
              ))}

              <button
                type="button"
                className="filter-chip filter-chip--add"
                onClick={() => {
                  setCategoryErrorMessage(null)
                  setIsCreateCategoryModalOpen(true)
                }}
              >
                Otra
              </button>
            </div>

            <div className="library-toolbar__actions">
              <button
                type="button"
                className="button--ghost"
                onClick={() => {
                  setCategoryErrorMessage(null)
                  setIsManageCategoriesModalOpen(true)
                }}
              >
                Editar categorias
              </button>
            </div>

            <label className="entry-mark-toggle">
              <input
                type="checkbox"
                checked={showUncheckedOnly}
                onChange={(event) => {
                  setShowUncheckedOnly(event.target.checked)
                  setCurrentPage(1)
                }}
              />
              <span>Solo no vistas</span>
            </label>
          </section>

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
                <span>Acciones</span>
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
                          <div className="library-row__meta-group">
                            <span className="library-row__type">
                              {typeLabelMap[entry.type]}
                            </span>
                            <span className="library-row__meta-pill">{uploaderLabel}</span>
                          </div>

                          <h2>{entry.title}</h2>
                          <p>{entry.summary || rowMeta || 'Sin descripcion todavia.'}</p>

                          <div className="library-row__details">
                            <span>{formatDate(entry.updatedAt)}</span>
                            {rowMeta ? <span>{rowMeta}</span> : null}
                          </div>
                        </div>

                        <span className="library-row__chevron" aria-hidden="true">
                          &#8250;
                        </span>
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
                          <span>Visto</span>
                        </label>

                        <button
                          type="button"
                          className="button--subtle-danger button--icon-only"
                          disabled={deletingId === entry.id}
                          aria-label={
                            deletingId === entry.id
                              ? `Borrando ${entry.title}`
                              : `Borrar ${entry.title}`
                          }
                          title="Borrar"
                          onClick={() => {
                            void handleDelete(entry)
                          }}
                        >
                          {deletingId === entry.id ? (
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
        </>
      ) : user ? (
        <section className="share-summary" aria-label="Personas con acceso compartido">
          <div className="share-summary__header">
            <div className="section-title">
              <h2>Compartiendo con</h2>
              <p>Desde aca podes invitar, revisar y cortar accesos compartidos.</p>
            </div>

            <div className="share-summary__header-actions">
              <span>
                {acceptedShares.length} activas | {pendingShares.length} pendientes
              </span>
              <button
                type="button"
                className="button"
                onClick={() => {
                  setIsShareOpen(true)
                }}
              >
                Share with
              </button>
            </div>
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

                  <div className="share-person-card__actions">
                    <span
                      className={
                        invitation.status === 'accepted'
                          ? 'share-person-card__status share-person-card__status--active'
                          : 'share-person-card__status'
                      }
                    >
                      {invitation.status === 'accepted' ? 'Activo' : 'Pendiente'}
                    </span>

                    <button
                      type="button"
                      className="button--subtle-danger"
                      disabled={revokingInvitationId === invitation.id}
                      onClick={() => {
                        void handleRevokeShare(invitation)
                      }}
                    >
                      {revokingInvitationId === invitation.id
                        ? 'Actualizando...'
                        : invitation.status === 'accepted'
                          ? 'Dejar de compartir'
                          : 'Cancelar invitacion'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

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
