import { useParams } from 'react-router-dom'

const detailSections = [
  'Datos estructurados revisados por la persona usuaria.',
  'Texto OCR consolidado y capturas asociadas en orden.',
  'Metadatos del tipo detectado y tags sugeridos por IA.',
]

export function EntryDetailPage() {
  const { entryId } = useParams()

  return (
    <section className="page">
      <div className="section-title">
        <h1>Detalle de entrada</h1>
        <p>
          Ruta preparada para abrir una entrada específica desde el listado o
          desde otro dispositivo.
        </p>
      </div>

      <article className="card">
        <h2>Entrada seleccionada</h2>
        <p className="muted">
          `entryId`: {entryId ?? 'pendiente de conexión con datos reales'}
        </p>
      </article>

      <article className="card">
        <h2>Qué va a mostrar esta vista</h2>
        <ul className="hint-list">
          {detailSections.map((section) => (
            <li key={section}>{section}</li>
          ))}
        </ul>
      </article>
    </section>
  )
}
