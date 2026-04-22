import { Link, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-context'
import { env } from '@/lib/env'

export function AppShell() {
  const { user, isLoading, signOut } = useAuth()
  const location = useLocation()
  const authLinkTarget =
    location.pathname === '/auth' ? '/auth?mode=signIn' : '/auth?mode=signIn'

  async function handleSignOut() {
    try {
      await signOut()
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__top">
            <div className="brand">
              <div className="brand__copy">
                <img
                  src="/logo.png"
                  alt="The Things We Share"
                  className="brand__logo"
                />
              </div>
            </div>

            <div className="app-header__actions">
              {user ? (
                <button
                  type="button"
                  className="button--ghost"
                  onClick={() => {
                    void handleSignOut()
                  }}
                >
                  Cerrar sesion
                </button>
              ) : (
                <Link to={authLinkTarget} className="button">
                  Iniciar sesion
                </Link>
              )}

              <p className="header-meta__text header-meta__text--stacked">
                {isLoading
                  ? 'Verificando sesion...'
                  : user?.email
                    ? `Sesion iniciada - ${user.email}`
                    : env.isSupabaseConfigured
                      ? 'Listo para iniciar sesion'
                      : 'Configura Supabase para continuar'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  )
}
