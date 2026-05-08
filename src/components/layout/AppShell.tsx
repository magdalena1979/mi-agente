import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import BackgroundLines from '@/components/BackgroundLines'
import { useAuth } from '@/features/auth/auth-context'
import { env } from '@/lib/env'

function getAvatarLabel(email?: string): string {
  if (!email) return 'U'
  return email.trim().charAt(0).toUpperCase() || 'U'
}

export function AppShell() {
  const location = useLocation()
  const { user, isLoading, signOut } = useAuth()
  const isHomeRoute = location.pathname === '/'
  const isAuthRoute = location.pathname === '/auth'
  const isLibraryRoute = isHomeRoute && Boolean(user)
  const isLandingRoute = isHomeRoute && !user && !isLoading
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [isHeaderSearchOpen, setIsHeaderSearchOpen] = useState(false)
  const [headerSearchValue, setHeaderSearchValue] = useState('')
  const headerSearchInputRef = useRef<HTMLInputElement | null>(null)
  const accountMenuRef = useRef<HTMLDivElement | null>(null)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)

  const headerStatusText = isLoading
    ? 'Verificando sesion...'
    : user?.email
      ? `Sesion iniciada - ${user.email}`
      : env.isSupabaseConfigured
        ? null
        : 'Configura Supabase para continuar'

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 16)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia('(max-width: 639px)')
    const updateViewport = () => {
      setIsMobileViewport(mediaQuery.matches)
    }

    updateViewport()
    mediaQuery.addEventListener('change', updateViewport)

    return () => {
      mediaQuery.removeEventListener('change', updateViewport)
    }
  }, [])

  useEffect(() => {
    if (!isLibraryRoute) {
      setIsHeaderSearchOpen(false)
      setHeaderSearchValue('')
      return
    }

    window.dispatchEvent(
      new CustomEvent('refind:library-search-change', {
        detail: headerSearchValue,
      }),
    )
  }, [headerSearchValue, isLibraryRoute])

  useEffect(() => {
    if (!isHeaderSearchOpen) {
      return
    }

    headerSearchInputRef.current?.focus()
  }, [isHeaderSearchOpen])

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsAccountMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isAccountMenuOpen])

  useEffect(() => {
    setIsAccountMenuOpen(false)
  }, [location.pathname])

  async function handleSignOut() {
    try {
      await signOut()
    } catch (error) {
      console.error(error)
    }
  }

  function handleHeaderSearch() {
    if (!isHeaderSearchOpen) {
      setIsHeaderSearchOpen(true)
      return
    }

    headerSearchInputRef.current?.focus()
    headerSearchInputRef.current?.select()
  }

  const shellClassName = [
    'app-shell',
    user ? 'app-shell--authenticated' : '',
    isAuthRoute ? 'app-shell--auth-route' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={shellClassName}
      style={{
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
        background: '#0D0D0D',
      }}
    >
      <BackgroundLines />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <header
          className={
            isAuthRoute
              ? `app-header app-header--auth-route${isScrolled ? ' app-header--scrolled' : ''}`
              : `app-header${isScrolled ? ' app-header--scrolled' : ''}`
          }
        >
          <div className="app-header__inner">
            <div className="app-header__top">
              <div className="brand">
                <img src="/logo.png" alt="Refind" className="brand__logo" />

                <div className="brand__copy">
                  <h1 className="brand__title">Refind</h1>
                </div>
              </div>

              <div
                className={
                  isLibraryRoute && isMobileViewport && isHeaderSearchOpen
                    ? 'app-header__actions app-header__actions--search-open'
                    : 'app-header__actions'
                }
              >
                {isLibraryRoute && isMobileViewport && isHeaderSearchOpen ? (
                  <label className="search-field app-header__search-field">
                    <span className="sr-only">Buscar en tu archivo</span>
                    <input
                      ref={headerSearchInputRef}
                      type="search"
                      value={headerSearchValue}
                      placeholder="Buscar"
                      onChange={(event) => {
                        setHeaderSearchValue(event.target.value)
                      }}
                    />
                  </label>
                ) : null}

                {isLibraryRoute ? (
                  <button
                    type="button"
                    className="button--ghost icon-button app-header__search"
                    aria-label="Buscar"
                    onClick={handleHeaderSearch}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-button__icon">
                      <path
                        d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : null}

                {user ? (
                  <div className="app-header__account-menu" ref={accountMenuRef}>
                    <button
                      type="button"
                      className="app-header__avatar-button"
                      aria-label={`Abrir menu de ${user.email?.split('@')[0] ?? 'tu cuenta'}`}
                      aria-expanded={isAccountMenuOpen}
                      aria-haspopup="menu"
                      onClick={() => {
                        setIsAccountMenuOpen((currentValue) => !currentValue)
                      }}
                    >
                      <span className="app-header__avatar" aria-hidden="true">
                        {getAvatarLabel(user.email)}
                      </span>
                    </button>

                    {isAccountMenuOpen ? (
                      <div className="app-header__account-dropdown" role="menu">
                        <button
                          type="button"
                          className="app-header__account-action"
                          role="menuitem"
                          onClick={() => void handleSignOut()}
                        >
                          Cerrar sesion
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {!user && !isLandingRoute && headerStatusText ? (
                  <p className="header-meta__text header-meta__text--stacked">
                    {headerStatusText}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
