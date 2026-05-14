import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

function LegalLayout(props: {
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="page">
      <article className="card">
        <div className="section-title">
          <span className="eyebrow">{props.eyebrow}</span>
          <h2>{props.title}</h2>
        </div>

        <div className="form-section">
          {props.children}
        </div>

        <div className="entry-form__actions">
          <Link className="button--ghost" to="/">
            Volver a Refind
          </Link>
        </div>
      </article>
    </section>
  )
}

export function PrivacyPolicyPage() {
  return (
    <LegalLayout eyebrow="Legal" title="Politica de privacidad">
      <p className="muted">
        Refind es una aplicación para guardar capturas, links y referencias personales. Esta
        política explica qué datos se recopilan, para qué se usan y cómo puedes pedir cambios
        o eliminaciónes.
      </p>

      <div className="form-section">
        <h3 className="form-section__title">Qué datos recopilamos</h3>
        <p className="muted">
          Podemos recopilar tu email de acceso, el contenido que subes a la app, capturas,
          links, categorias personales, marcas de uso y datos tecnicos minimos necesarios para
          que el servicio funcione.
        </p>
      </div>

      <div className="form-section">
        <h3 className="form-section__title">Cómo usamos esos datos</h3>
        <p className="muted">
          Usamos los datos para autenticar tu cuenta, guardar tus entradas, organizar tu
          biblioteca, ejecutar OCR sobre capturas, generar campos sugeridos con IA y mejorar la
          experiencia general del producto.
        </p>
      </div>

      <div className="form-section">
        <h3 className="form-section__title">Servicios de terceros</h3>
        <p className="muted">
          Refind puede usar servicios de terceros para autenticacion, base de datos, almacenamiento
          de archivos e inferencia de IA. Esos proveedores solo procesan la información necesaria
          para prestar el servicio solicitado.
        </p>
      </div>

      <div className="form-section">
        <h3 className="form-section__title">Conservacion y control</h3>
        <p className="muted">
          Conservamos la información mientras tu cuenta este activa o mientras sea necesaria para
          operar Refind. Puedes solicitar la eliminación de tus datos siguiendo las instrucciones
          publicadas en la página de eliminación de datos.
        </p>
      </div>

      <div className="form-section">
        <h3 className="form-section__title">Contacto</h3>
        <p className="muted">
          Si tienes preguntas sobre privacidad o tratamiento de datos, puedes escribir a
          `malebelaustegui@yahoo.com.ar`.
        </p>
      </div>
    </LegalLayout>
  )
}

export function DataDeletionPage() {
  return (
    <LegalLayout eyebrow="Legal" title="Eliminacion de datos de usuario">
      <p className="muted">
        Si quieres solicitar la eliminación de tus datos de Refind, envia un email a
        `malebelaustegui@yahoo.com.ar` con el asunto `Eliminacion de datos - Refind`.
      </p>

      <div className="form-section">
        <h3 className="form-section__title">Qué incluir en la solicitud</h3>
        <p className="muted">
          Incluye el email con el que usas la app y, si quieres, una breve descripción para
          ayudarnos a identificar tu cuenta más rapido.
        </p>
      </div>

      <div className="form-section">
        <h3 className="form-section__title">Qué pasa después</h3>
        <p className="muted">
          Revisaremos la solicitud y eliminaremos la información asociada a tu cuenta dentro de un
          plazo razónable, salvo que debamos conservar una parte por motivos legales, de seguridad
          o prevencion de fraude.
        </p>
      </div>

      <div className="form-section">
        <h3 className="form-section__title">Resultado esperado</h3>
        <p className="muted">
          La eliminación puede incluir cuenta, entradas, capturas, links, categorias personales y
          datos relacionados almacenados para operar Refind.
        </p>
      </div>
    </LegalLayout>
  )
}
