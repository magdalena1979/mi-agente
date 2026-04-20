import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'

import { useAuth } from '@/features/auth/auth-context'

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <section className="page">
        <article className="card">
          <h2>Preparando sesion</h2>
          <p>Estamos cargando tu estado actual.</p>
        </article>
      </section>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
