import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  createManyUserCategories,
  createUserCategory,
  deleteUserCategory,
  listEntryUserCategories,
  listUserCategories,
} from '@/features/categories/categories-api'
import { getSuggestedCategoryKeyForEntryType } from '@/features/categories/category-mapping'
import { CreateUserCategoryModal } from '@/features/categories/components/CreateUserCategoryModal'
import { ManageUserCategoriesModal } from '@/features/categories/components/ManageUserCategoriesModal'
import { UserCategorySetupModal } from '@/features/categories/components/UserCategorySetupModal'
import {
  hasSeenCategorySetupModal,
  markCategorySetupModalSeen,
} from '@/features/auth/auth-preferences'
import { useAuth } from '@/features/auth/auth-context'
import { DEFAULT_USER_CATEGORY_NAMES, type UserCategoryRecord } from '@/types/categories'
import { entryTypeOptions } from '@/features/entries/config/entry-type-config'
import { deleteEntry, listEntries, updateEntry } from '@/features/entries/entries-api'
import { listEntryUserMarks, upsertEntryUserMark } from '@/features/sharing/sharing-api'
import type { EntryRecord, EntryType, EntryUserMarkRecord } from '@/types/entries'

const PAGE_SIZE = 20
const MOBILE_SWIPE_ACTIONS_WIDTH = 216
const MOBILE_SWIPE_OPEN_THRESHOLD = 88

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
  const suggestedCategoryNames = useMemo(() => [...DEFAULT_USER_CATEGORY_NAMES], [])
  const [entries, setEntries] = useState<EntryRecord[]>([])
  const [entryMarksById, setEntryMarksById] = useState<Record<string, EntryUserMarkRecord>>({})
  const [userCategories, setUserCategories] = useState<UserCategoryRecord[]>([])
  const [entryCategoryIdsByEntryId, setEntryCategoryIdsByEntryId] = useState<Record<string, string[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState<'all' | string>('all')
  const [showUncheckedOnly, setShowUncheckedOnly] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [isCreateCategoryModalOpen, setIsCreateCategoryModalOpen] = useState(false)
  const [isSavingCategory, setIsSavingCategory] = useState(false)
  const [isManageCategoriesModalOpen, setIsManageCategoriesModalOpen] = useState(false)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)
  const [categoryErrorMessage, setCategoryErrorMessage] = useState<string | null>(null)
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false)
  const [isLoadingUserCategories, setIsLoadingUserCategories] = useState(false)
  const [isSavingCategorySetup, setIsSavingCategorySetup] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [openSwipeEntryId, setOpenSwipeEntryId] = useState<string | null>(null)
  const [draggingSwipeEntryId, setDraggingSwipeEntryId] = useState<string | null>(null)
  const [dragStartX, setDragStartX] = useState<number | null>(null)
  const [dragStartOffsetX, setDragStartOffsetX] = useState(0)
  const [dragOffsetX, setDragOffsetX] = useState(0)
  const userCategoriesById = useMemo(
    () =>
      userCategories.reduce<Record<string, UserCategoryRecord>>((accumulator, category) => {
        accumulator[category.id] = category
        return accumulator
      }, {}),
    [userCategories],
  )

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
          setIsSetupModalOpen(false)
          setIsLoadingUserCategories(false)
        }
        return
      }

      setIsLoadingUserCategories(true)

      try {
        const nextCategories = await listUserCategories(user.id)

        if (!ignore) {
          setUserCategories(nextCategories)
          setIsSetupModalOpen(
            nextCategories.length === 0 && !hasSeenCategorySetupModal(user),
          )
        }

        if (nextCategories.length > 0 && !hasSeenCategorySetupModal(user)) {
          await markCategorySetupModalSeen()
        }
      } catch (error) {
        if (!ignore) {
          setCategoryErrorMessage(
            error instanceof Error
              ? error.message
              : 'No pudimos cargar tus subcategorias personales.',
          )
        }
      } finally {
        if (!ignore) {
          setIsLoadingUserCategories(false)
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

  // Compartido desactivado temporalmente en el frontend.
  // useEffect(() => {
  //   let ignore = false
  //
  //   async function loadSharedPeople() {
  //     if (!user) {
  //       if (!ignore) {
  //         setSharedInvitations([])
  //       }
  //       return
  //     }
  //
  //     try {
  //       const nextInvitations = await listSentEntriesShareInvitations(user.id)
  //
  //       if (!ignore) {
  //         setSharedInvitations(nextInvitations)
  //       }
  //     } catch (error) {
  //       if (!ignore) {
  //         setErrorMessage(
  //           error instanceof Error
  //             ? error.message
  //             : 'No pudimos cargar con quien estas compartiendo.',
  //         )
  //       }
  //     }
  //   }
  //
  //   void loadSharedPeople()
  //
  //   return () => {
  //     ignore = true
  //   }
  // }, [user])

  const filteredEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    const activeCategory =
      activeCategoryId === 'all' ? null : userCategoriesById[activeCategoryId] ?? null

    return entries.filter((entry) => {
      if (entry.status === 'archived') {
        return false
      }

      const assignedCategoryIds = entryCategoryIdsByEntryId[entry.id] ?? []
      const matchesSuggestedTypeCategory =
        activeCategory !== null &&
        activeCategory.normalizedName === getSuggestedCategoryKeyForEntryType(entry.type)
      const matchesCategory =
        activeCategoryId === 'all' ||
        assignedCategoryIds.includes(activeCategoryId) ||
        matchesSuggestedTypeCategory
      const isChecked = entryMarksById[entry.id]?.isChecked ?? false
      const matchesMark = !showUncheckedOnly || !isChecked
      const matchesQuery =
        normalizedQuery.length === 0 ||
        getEntrySearchText(entry).includes(normalizedQuery)

      return matchesCategory && matchesMark && matchesQuery
    })
  }, [
    activeCategoryId,
    entries,
    entryCategoryIdsByEntryId,
    entryMarksById,
    searchQuery,
    showUncheckedOnly,
    userCategoriesById,
  ])

  useEffect(() => {
    if (
      activeCategoryId !== 'all' &&
      !userCategories.some((category) => category.id === activeCategoryId)
    ) {
      setActiveCategoryId('all')
    }
  }, [activeCategoryId, userCategories])

  useEffect(() => {
    if (!user || isLoadingUserCategories) {
      return
    }

    const shouldOpenSetupModal =
      userCategories.length === 0 && !hasSeenCategorySetupModal(user)

    setIsSetupModalOpen(shouldOpenSetupModal)
  }, [isLoadingUserCategories, user, userCategories.length])

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
    setActionMessage(null)

    try {
      await deleteEntry(entry.id)
      setEntries((currentEntries) =>
        currentEntries.filter((currentEntry) => currentEntry.id !== entry.id),
      )
      setOpenSwipeEntryId(null)
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

  async function handleArchive(entry: EntryRecord) {
    if (!user) {
      return
    }

    setArchivingId(entry.id)
    setErrorMessage(null)
    setActionMessage(null)

    try {
      await updateEntry(entry.id, {
        userId: user.id,
        type: entry.type,
        title: entry.title,
        summary: entry.summary,
        sourceType: entry.sourceType,
        sourceName: entry.sourceName,
        sourceUrl: entry.sourceUrl,
        status: 'archived',
        aiTags: entry.aiTags,
        extractedText: entry.extractedText,
        metadata: entry.metadata,
        uploaderName: entry.uploaderName,
        uploaderEmail: entry.uploaderEmail,
      })

      setEntries((currentEntries) =>
        currentEntries.filter((currentEntry) => currentEntry.id !== entry.id),
      )
      setOpenSwipeEntryId(null)
      setActionMessage('La entrada se archivo correctamente.')
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos archivar esta entrada.',
      )
    } finally {
      setArchivingId(null)
    }
  }

  function handleShare(entry: EntryRecord) {
    setErrorMessage(null)
    setActionMessage(`Compartir "${entry.title}" estara disponible pronto.`)
    setOpenSwipeEntryId(null)
  }

  function handleSwipeStart(entryId: string, clientX: number) {
    setDraggingSwipeEntryId(entryId)
    setDragStartX(clientX)
    const nextStartOffset =
      openSwipeEntryId === entryId ? MOBILE_SWIPE_ACTIONS_WIDTH : 0
    setDragStartOffsetX(nextStartOffset)
    setDragOffsetX(nextStartOffset)
    if (openSwipeEntryId && openSwipeEntryId !== entryId) {
      setOpenSwipeEntryId(null)
    }
  }

  function handleSwipeMove(clientX: number) {
    if (!draggingSwipeEntryId || dragStartX === null) {
      return
    }

    const nextOffset = Math.max(
      0,
      Math.min(MOBILE_SWIPE_ACTIONS_WIDTH, dragStartX - clientX + dragStartOffsetX),
    )

    setDragOffsetX(nextOffset)
  }

  function handleSwipeEnd() {
    if (!draggingSwipeEntryId) {
      return
    }

    setOpenSwipeEntryId(
      dragOffsetX >= MOBILE_SWIPE_OPEN_THRESHOLD ? draggingSwipeEntryId : null,
    )
    setDraggingSwipeEntryId(null)
    setDragStartX(null)
    setDragStartOffsetX(0)
    setDragOffsetX(0)
  }

  // Compartido desactivado temporalmente en el frontend.
  // async function handleRevokeShare(invitation: InvitationRecord) {
  //   const actionLabel =
  //     invitation.status === 'accepted'
  //       ? `dejar de compartir con ${invitation.email}`
  //       : `cancelar la invitacion para ${invitation.email}`
  //
  //   const confirmed = window.confirm(
  //     `Vas a ${actionLabel}. Esta accion no elimina la cuenta de la otra persona.`,
  //   )
  //
  //   if (!confirmed) {
  //     return
  //   }
  //
  //   setRevokingInvitationId(invitation.id)
  //   setErrorMessage(null)
  //
  //   try {
  //     await revokeEntriesShare(invitation.id)
  //     setSharedInvitations((currentInvitations) =>
  //       currentInvitations.filter(
  //         (currentInvitation) => currentInvitation.id !== invitation.id,
  //       ),
  //     )
  //   } catch (error) {
  //     setErrorMessage(
  //       error instanceof Error
  //         ? error.message
  //         : 'No pudimos actualizar esta relacion compartida.',
  //     )
  //   } finally {
  //     setRevokingInvitationId(null)
  //   }
  // }

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
      await markCategorySetupModalSeen()

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

  async function handleDismissSetupModal() {
    setCategoryErrorMessage(null)

    try {
      await markCategorySetupModalSeen()
      setIsSetupModalOpen(false)
    } catch (error) {
      setCategoryErrorMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos guardar tu preferencia para este modal.',
      )
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

  useEffect(() => {
    function handleLibrarySearchChange(event: Event) {
      const nextValue =
        event instanceof CustomEvent && typeof event.detail === 'string'
          ? event.detail
          : ''

      setSearchQuery(nextValue)
      setCurrentPage(1)
    }

    window.addEventListener('refind:library-search-change', handleLibrarySearchChange)

    return () => {
      window.removeEventListener('refind:library-search-change', handleLibrarySearchChange)
    }
  }, [])

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
          void handleDismissSetupModal()
        }}
        onSubmit={handleSetupCategories}
      />

      <header className="library-header">
        <div className="library-header__main">
          <div className="section-title library-header__copy">
            <h1>Biblioteca</h1>
            <p>Tus capturas, links y recomendaciones en una lista clara y facil de explorar.</p>
          </div>

          {/* Compartido desactivado temporalmente en el frontend.
          <div className="library-tabs" aria-label="Secciones principales">
            ...
          </div>
          */}
        </div>

        {/* Compartido desactivado temporalmente en el frontend.
        <div className="library-header__actions">
          <NotificationsBell />
        </div>
        */}
      </header>

      {errorMessage ? <p className="feedback feedback--error">{errorMessage}</p> : null}
      {actionMessage ? <p className="feedback feedback--success">{actionMessage}</p> : null}

        <>
          <section className="library-toolbar">
            <div
              className="filter-row filter-row--mobile"
              aria-label="Filtrar por categoria personal o tipo detectado"
            >
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

            <label className="search-field library-toolbar__search library-toolbar__search--desktop">
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

            <div
              className="filter-row filter-row--desktop"
              aria-label="Filtrar por categoria personal o tipo detectado"
            >
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
                className="button--ghost library-toolbar__manage-categories"
                onClick={() => {
                  setCategoryErrorMessage(null)
                  setIsManageCategoriesModalOpen(true)
                }}
              >
                Editar categorias
              </button>

              <Link
                className="button library-toolbar__add"
                to="/entries/new"
                aria-label="Agregar algo"
              >
                <span className="library-toolbar__add-mobile">Agregar</span>
                <span className="library-toolbar__add-desktop">Agregar algo</span>
              </Link>
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
              <p>Proba otro texto o cambia la categoria del filtro.</p>
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
                  const isSwipeOpen = openSwipeEntryId === entry.id
                  const swipeOffset =
                    draggingSwipeEntryId === entry.id
                      ? dragOffsetX
                      : isSwipeOpen
                        ? MOBILE_SWIPE_ACTIONS_WIDTH
                        : 0
                  const isSwipeBusy =
                    deletingId === entry.id || archivingId === entry.id

                  return (
                    <div className="library-row-swipe-shell" key={entry.id}>
                      <div className="library-row-swipe-actions" aria-hidden={!isSwipeOpen}>
                        <button
                          type="button"
                          className="library-row-swipe-action library-row-swipe-action--archive"
                          disabled={isSwipeBusy}
                          onClick={() => {
                            void handleArchive(entry)
                          }}
                        >
                          {archivingId === entry.id ? 'Archivando...' : 'Archivar'}
                        </button>
                        <button
                          type="button"
                          className="library-row-swipe-action library-row-swipe-action--delete"
                          disabled={isSwipeBusy}
                          onClick={() => {
                            void handleDelete(entry)
                          }}
                        >
                          {deletingId === entry.id ? 'Borrando...' : 'Eliminar'}
                        </button>
                        <button
                          type="button"
                          className="library-row-swipe-action library-row-swipe-action--share"
                          disabled={isSwipeBusy}
                          onClick={() => {
                            handleShare(entry)
                          }}
                        >
                          Compartir
                        </button>
                      </div>

                    <article
                      className={isSwipeOpen ? 'library-row library-row--swiped' : 'library-row'}
                      style={{ transform: `translateX(-${swipeOffset}px)` }}
                      onTouchStart={(event) => {
                        handleSwipeStart(entry.id, event.touches[0].clientX)
                      }}
                      onTouchMove={(event) => {
                        handleSwipeMove(event.touches[0].clientX)
                      }}
                      onTouchEnd={handleSwipeEnd}
                      onTouchCancel={handleSwipeEnd}
                    >
                      <Link
                        className="library-row__main"
                        to={`/entries/${entry.id}`}
                        onClick={(event) => {
                          if (isSwipeOpen || draggingSwipeEntryId === entry.id) {
                            event.preventDefault()
                            setOpenSwipeEntryId(null)
                            setDraggingSwipeEntryId(null)
                            setDragStartX(null)
                            setDragStartOffsetX(0)
                            setDragOffsetX(0)
                          }
                        }}
                      >
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
                    </div>
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
      {/* Compartido desactivado temporalmente en el frontend.
      <section className="share-summary" aria-label="Personas con acceso compartido">
        ...
      </section>
      <ShareEntriesModal ... />
      */}
    </section>
  )
}
