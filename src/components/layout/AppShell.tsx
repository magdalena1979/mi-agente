import { NavLink, Outlet } from 'react-router-dom'

import { StatusPill } from '@/components/ui/StatusPill'
import { env } from '@/lib/env'

const links = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/entries/new', label: 'Nueva entrada' },
  { to: '/auth', label: 'Auth' },
]

function getLinkClassName(isActive: boolean, baseClassName: string) {
  return isActive ? `${baseClassName} ${baseClassName}--active` : baseClassName
}

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <div className="brand">
            <div>
              <h1 className="brand__title">Mi Agente</h1>
              <p className="brand__subtitle">
                OCR + IA + revisión manual sobre capturas personales.
              </p>
            </div>
            <StatusPill
              tone={env.isSupabaseConfigured ? 'success' : 'warning'}
              label={
                env.isSupabaseConfigured
                  ? 'Supabase listo para conectar'
                  : 'Falta configurar variables de entorno'
              }
            />
          </div>

          <nav className="top-nav" aria-label="Navegación principal">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  getLinkClassName(isActive, 'top-nav__link')
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Accesos rápidos">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              getLinkClassName(isActive, 'bottom-nav__link')
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
