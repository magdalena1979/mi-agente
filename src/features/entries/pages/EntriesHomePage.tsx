import { Link } from 'react-router-dom'

import { entryTypeOptions } from '@/features/entries/config/entry-type-config'

const flowSteps = [
  'Subir una o varias capturas para la misma entrada.',
  'Correr OCR por imagen y consolidar el texto.',
  'Enviar el texto al endpoint serverless para clasificación y extracción.',
  'Revisar el formulario sugerido antes de guardar.',
]

const dependencyCards = [
  {
    name: 'Frontend',
    description: 'React + TypeScript + Vite 7 con routing simple y PWA.',
  },
  {
    name: 'Datos',
    description: 'Supabase para auth, Postgres, RLS y Storage privado.',
  },
  {
    name: 'IA',
    description: 'Groq detrás de un endpoint serverless de Vercel.',
  },
]

export function EntriesHomePage() {
  return (
    <section className="page">
      <article className="hero-card">
        <div>
          <span className="hero-card__eyebrow">Etapa 1 completada</span>
          <h2>Base del MVP lista para empezar a construir flujo real.</h2>
          <p>
            Dejamos el proyecto inicializado, PWA preparada, estructura por
            features, dependencias instaladas y esquema SQL inicial para
            Supabase.
          </p>
          <div className="hero-card__actions">
            <Link className="button" to="/entries/new">
              Ver pantalla de creación
            </Link>
            <Link className="button--ghost" to="/auth">
              Revisar módulo auth
            </Link>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <strong>7 tipos</strong>
            <span>book, event, recipe, movie, series, collection y other</span>
          </div>
          <div className="stat-card">
            <strong>2 tablas núcleo</strong>
            <span>`entries` y `entry_images`, con `entry_items` contemplada</span>
          </div>
          <div className="stat-card">
            <strong>1 flujo</strong>
            <span>capturas → OCR → IA → revisión manual → guardado</span>
          </div>
        </div>
      </article>

      <div className="card-grid card-grid--two">
        <article className="card">
          <div className="section-title">
            <h2>Dependencias base</h2>
            <p>Las elegidas priorizan mantener el MVP simple y extensible.</p>
          </div>

          <div className="dependency-list">
            {dependencyCards.map((card) => (
              <div key={card.name} className="field-card">
                <strong>{card.name}</strong>
                <p>{card.description}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <div className="section-title">
            <h2>Flujo previsto</h2>
            <p>La IA asiste la carga, pero la persona conserva el control.</p>
          </div>

          <div className="steps">
            {flowSteps.map((step, index) => (
              <div className="step" key={step}>
                <span className="step__index">{index + 1}</span>
                <p>{step}</p>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="card">
        <div className="section-title">
          <h2>Tipos soportados desde el arranque</h2>
          <p>
            Ya quedó modelada la configuración base para el futuro formulario
            dinámico.
          </p>
        </div>

        <div className="chip-row">
          {entryTypeOptions.map((option) => (
            <div key={option.type} className="chip">
              <strong>{option.label}</strong>
              <p>{option.description}</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}
