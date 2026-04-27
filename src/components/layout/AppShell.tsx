import { Outlet } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-context'
import { env } from '@/lib/env'

export function AppShell() {
  const { user, isLoading, signOut } = useAuth()
  const headerStatusText = isLoading
    ? 'Verificando sesion...'
    : user?.email
      ? `Sesion iniciada - ${user.email}`
      : env.isSupabaseConfigured
        ? null
        : 'Configura Supabase para continuar'

  async function handleSignOut() {
    try {
      await signOut()
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <div className={user ? 'app-shell app-shell--authenticated' : 'app-shell'}>
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__top">
            <div className="brand">
              <img src="/logo.png" alt="Refind" className="brand__logo" />

              <div className="brand__copy">
                <h1 className="brand__title">Refind</h1>
                <p className="brand__subtitle">
                  Archivo personal para guardar y ordenar hallazgos con criterio.
                </p>
              </div>
            </div>

            <div className="app-header__actions">
              {user ? (
                <button
                  type="button"
                  className="button--ghost app-header__logout"
                  onClick={() => {
                    void handleSignOut()
                  }}
                >
                  Cerrar sesion
                </button>
              ) : null}

              {headerStatusText ? (
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
  )
}
