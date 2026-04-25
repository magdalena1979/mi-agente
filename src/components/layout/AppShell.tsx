import { Outlet } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-context'
import { env } from '@/lib/env'

export function AppShell() {
  const { user, isLoading, signOut } = useAuth()

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
                <h1 className="brand__title">The Things We Share</h1>
                <p className="brand__subtitle">
                  Guarda, ordena y comparte hallazgos en un espacio simple.
                </p>
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
              ) : null}

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
