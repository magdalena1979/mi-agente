import { env } from '@/lib/env'

const authSteps = [
  'Registro con email y contraseña usando Supabase Auth.',
  'Inicio de sesión persistente en la PWA.',
  'Cierre de sesión desde la home y protección de rutas privadas.',
]

export function AuthPage() {
  return (
    <section className="page">
      <div className="section-title">
        <h1>Auth del MVP</h1>
        <p>
          Esta pantalla ya queda reservada para login y registro. En la
          siguiente etapa la conectamos a Supabase Auth sin cambiar la
          estructura.
        </p>
      </div>

      <div className="card-grid card-grid--two">
        <article className="card">
          <h2>Decisión base</h2>
          <p>
            Vamos con email/password para evitar complejidad innecesaria en el
            MVP y habilitar multiusuario desde el primer release.
          </p>
          <ul className="hint-list">
            {authSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </article>

        <article className="callout">
          <h2>Estado actual</h2>
          <p>
            {env.isSupabaseConfigured
              ? 'Las variables públicas de Supabase están presentes.'
              : 'Todavía falta cargar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.'}
          </p>
        </article>
      </div>
    </section>
  )
}
