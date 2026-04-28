import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-context'
import { NotificationsBell } from '@/features/sharing/components/NotificationsBell'
import BackgroundLines from '@/components/BackgroundLines'
import { env } from '@/lib/env'

function getAvatarLabel(email?: string): string {
  if (!email) return 'U'
  return email.trim().charAt(0).toUpperCase() || 'U'
}

export function AppShell() {
  const location = useLocation()
  const { user, isLoading, signOut } = useAuth()
  const isAuthRoute = location.pathname === '/auth'
  const [isScrolled, setIsScrolled] = useState(false)

  const headerStatusText = isLoading
    ? 'Verificando sesión...'
    : user?.email
      ? `Sesión iniciada - ${user.email}`
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

  async function handleSignOut() {
    try {
      await signOut()
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <div
      className={
        user
          ? `app-shell app-shell--authenticated${isAuthRoute ? ' app-shell--auth-route' : ''}`
          : `app-shell${isAuthRoute ? ' app-shell--auth-route' : ''}`
      }
      style={{
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
        background: '#0D0D0D',
      }}
    >
      {/* BACKGROUND */}
      <BackgroundLines />

      {/* CONTENIDO */}
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

              <div className="app-header__actions">
                {user ? (
                  <>
                    <button
                      type="button"
                      className="button--ghost app-header__logout app-header__logout--mobile"
                      onClick={() => void handleSignOut()}
                    >
                      Cerrar sesión
                    </button>

                    <NotificationsBell />

                    <div className="app-header__avatar-block">
                      <div className="app-header__avatar" aria-hidden="true">
                        {getAvatarLabel(user.email)}
                      </div>

                      <div className="app-header__avatar-copy">
                        <strong>{user.email?.split('@')[0] ?? 'Tu cuenta'}</strong>
                        <button
                          type="button"
                          className="app-header__logout"
                          onClick={() => void handleSignOut()}
                        >
                          Cerrar sesión
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <Link className="button--ghost app-header__signin" to="/auth">
                    Iniciar sesión
                  </Link>
                )}

                {!user && headerStatusText ? (
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