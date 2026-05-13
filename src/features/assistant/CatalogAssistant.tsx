import { useEffect, useMemo, useRef, useState } from 'react'

import { askCatalogAssistant } from '@/features/assistant/catalog-assistant-api'
import { listEntries } from '@/features/entries/entries-api'
import type { EntryRecord } from '@/types/entries'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

const suggestedPrompts = [
  'Que peli drama puedo ver?',
  'Que libros cargue ultimamente?',
  'Mostrame recetas pendientes',
]
const searchStopWords = new Set([
  'algo',
  'cargue',
  'cargué',
  'cosas',
  'decime',
  'decir',
  'dime',
  'sobre',
  'tengo',
  'tenes',
  'tenés',
  'tienes',
  'ultimamente',
  'últimamente',
  'puedo',
  'para',
  'quiero',
  'recomenda',
  'recomendame',
  'recomendar',
  'ver',
])

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'No pudimos responder el chat en este momento.'
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function getEntrySearchText(entry: EntryRecord) {
  return normalizeText(
    [
      entry.title,
      entry.summary,
      entry.type,
      entry.sourceName ?? '',
      entry.aiTags.join(' '),
      entry.metadata.genre ?? '',
      entry.metadata.topic ?? '',
      entry.metadata.note ?? '',
      entry.metadata.director ?? '',
      entry.metadata.author ?? '',
      entry.metadata.platform ?? '',
      entry.metadata.year ?? '',
    ].join(' '),
  )
}

function formatEntryList(entries: EntryRecord[]) {
  return entries
    .slice(0, 5)
    .map((entry) => {
      const detail = [
        entry.metadata.genre,
        entry.metadata.director,
        entry.metadata.author,
        entry.metadata.year,
      ]
        .filter(Boolean)
        .join(', ')

      return detail ? `- ${entry.title}: ${detail}` : `- ${entry.title}`
    })
    .join('\n')
}

function answerFromLocalCatalog(message: string, entries: EntryRecord[]) {
  const normalizedMessage = normalizeText(message)
  const activeEntries = entries.filter((entry) => entry.status !== 'archived')
  const queryTokens = normalizedMessage
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]+/g, ''))
    .filter((token) => token.length > 3 && !searchStopWords.has(token))

  if (normalizedMessage.includes('libro')) {
    const books = activeEntries
      .filter((entry) => entry.type === 'book')
      .sort((leftEntry, rightEntry) =>
        rightEntry.updatedAt.localeCompare(leftEntry.updatedAt),
      )

    if (books.length > 0) {
      return `Estos son los libros que cargaste mas recientemente:\n${formatEntryList(books)}`
    }
  }

  const wantsMovie =
    /\b(peli|pelicula|cine|ver)\b/.test(normalizedMessage) ||
    normalizedMessage.includes('cannes')
  const candidateEntries = activeEntries
    .filter((entry) =>
      wantsMovie
        ? entry.type === 'movie' || entry.type === 'series' || entry.type === 'collection'
        : true,
    )
    .filter((entry) => {
      if (queryTokens.length === 0) {
        return false
      }

      const entryText = getEntrySearchText(entry)
      return queryTokens.every((token) => entryText.includes(token))
    })
    .sort((leftEntry, rightEntry) =>
      rightEntry.updatedAt.localeCompare(leftEntry.updatedAt),
    )

  if (candidateEntries.length > 0) {
    return `Puedo responder con tu biblioteca, aunque la IA no este disponible ahora. Encontré estas opciones:\n${formatEntryList(candidateEntries)}`
  }

  if (queryTokens.length > 0) {
    return `No encontré entradas cargadas sobre ${queryTokens.join(', ')} en tu biblioteca.`
  }

  return 'No pude conectar con la IA ahora y no encontré una coincidencia clara en tu biblioteca.'
}

export function CatalogAssistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [entries, setEntries] = useState<EntryRecord[]>([])
  const [isLoadingEntries, setIsLoadingEntries] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Preguntame por tu biblioteca: pelis por genero, libros recientes, recetas, lugares o pendientes.',
    },
  ])
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const availableEntries = useMemo(
    () => entries.filter((entry) => entry.status !== 'archived'),
    [entries],
  )

  useEffect(() => {
    if (!isOpen) {
      return
    }

    let ignore = false

    async function loadCatalog() {
      setIsLoadingEntries(true)

      try {
        const nextEntries = await listEntries()

        if (!ignore) {
          setEntries(nextEntries)
        }
      } catch {
        if (!ignore) {
          setEntries([])
        }
      } finally {
        if (!ignore) {
          setIsLoadingEntries(false)
        }
      }
    }

    void loadCatalog()

    return () => {
      ignore = true
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [isOpen, messages])

  async function sendMessage(message: string) {
    const normalizedMessage = message.trim()

    if (!normalizedMessage || isSending) {
      return
    }

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      text: normalizedMessage,
    }

    setMessages((currentMessages) => [...currentMessages, userMessage])
    setInputValue('')
    setIsSending(true)

    try {
      const answer = await askCatalogAssistant({
        message: normalizedMessage,
        entries: availableEntries,
      })

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId(),
          role: 'assistant',
          text: answer,
        },
      ])
    } catch (error) {
      const fallbackAnswer = answerFromLocalCatalog(normalizedMessage, availableEntries)

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId(),
          role: 'assistant',
          text: fallbackAnswer || getErrorMessage(error),
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className={isOpen ? 'catalog-assistant catalog-assistant--open' : 'catalog-assistant'}>
      {isOpen ? (
        <section className="catalog-assistant__panel" aria-label="Chat con tu biblioteca">
          <header className="catalog-assistant__header">
            <div>
              <span>IA</span>
              <strong>Tu biblioteca</strong>
            </div>

            <button
              type="button"
              className="catalog-assistant__close"
              aria-label="Cerrar chat"
              onClick={() => {
                setIsOpen(false)
              }}
            >
              x
            </button>
          </header>

          <div className="catalog-assistant__messages">
            {messages.map((message) => (
              <article
                key={message.id}
                className={
                  message.role === 'user'
                    ? 'catalog-assistant__message catalog-assistant__message--user'
                    : 'catalog-assistant__message'
                }
              >
                {message.text}
              </article>
            ))}

            {isSending ? (
              <article className="catalog-assistant__message">
                Pensando con tus entries...
              </article>
            ) : null}

            <div ref={messagesEndRef} />
          </div>

          {messages.length === 1 ? (
            <div className="catalog-assistant__suggestions">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={isSending}
                  onClick={() => {
                    void sendMessage(prompt)
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="catalog-assistant__form"
            onSubmit={(event) => {
              event.preventDefault()
              void sendMessage(inputValue)
            }}
          >
            <input
              type="text"
              value={inputValue}
              placeholder={
                isLoadingEntries
                  ? 'Cargando tu biblioteca...'
                  : 'Preguntale algo a tu biblioteca'
              }
              disabled={isSending || isLoadingEntries}
              onChange={(event) => {
                setInputValue(event.target.value)
              }}
            />
            <button type="submit" disabled={isSending || isLoadingEntries || !inputValue.trim()}>
              Enviar
            </button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        className="catalog-assistant__fab"
        aria-label={isOpen ? 'Cerrar asistente' : 'Abrir asistente'}
        onClick={() => {
          setIsOpen((currentValue) => !currentValue)
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 6.75A3.75 3.75 0 0 1 8.75 3h6.5A3.75 3.75 0 0 1 19 6.75v5.5A3.75 3.75 0 0 1 15.25 16H11l-4.5 4v-4.28A3.75 3.75 0 0 1 5 12.75v-6Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <path
            d="M9 9.5h6M9 12.5h3.7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
          />
        </svg>
      </button>
    </div>
  )
}
