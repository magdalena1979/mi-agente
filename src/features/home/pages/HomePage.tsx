import { Link } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-context'
import { EntriesHomePage } from '@/features/entries/pages/EntriesHomePage'

const landingSlides = [
  {
    index: '01',
    title: 'Tené lo que te gusta organizado',
    description:
      'Guardá ideas, productos, hallazgos y referencias en un mismo lugar para volver cuando quieras.',
  },
  {
    index: '02',
    title: 'Agregá una captura de pantalla, subí un PDF o pegá un link de lo que te interese',
    description:
      'Capturá lo importante en segundos y armá tu archivo personal sin cortar tu flujo.',
  },
  {
    index: '03',
    title: 'Encontralo facilmente',
    description:
      'Recuperá lo que guardaste sin perder tiempo, con una vista pensada para volver a lo importante.',
  },
]

function LandingPage() {
  return (
    <section className="page page--landing">
      <article className="landing-hero">
        <div className="landing-hero__copy">
          <span className="eyebrow landing-hero__eyebrow">Tu archivo personal para volver</span>
          <h2>Todo lo que querés guardar, mirar y reencontrar después.</h2>
          <p>
            Refind te ayuda a ordenar lo que descubrís online para que no quede perdido entre
            capturas, pestañas y links sueltos.
          </p>
        </div>

        <div className="landing-slider" aria-label="Beneficios de Refind">
          {landingSlides.map((slide) => (
            <article key={slide.index} className="landing-slide">
              <span className="landing-slide__index">{slide.index}</span>
              <div className="landing-slide__body">
                <h3>{slide.title}</h3>
                <p>{slide.description}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="landing-hero__cta">
          <Link className="button landing-hero__button" to="/auth">
            Empezá ya
          </Link>
        </div>
      </article>
    </section>
  )
}

export function HomePage() {
  const { isLoading, user } = useAuth()

  if (isLoading) {
    return (
      <section className="page">
        <article className="card">
          <h2>Preparando Refind</h2>
          <p>Estamos revisando tu sesión para mostrarte tu espacio.</p>
        </article>
      </section>
    )
  }

  if (user) {
    return <EntriesHomePage />
  }

  return <LandingPage />
}
