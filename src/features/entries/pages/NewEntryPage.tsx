import { entryTypeOptions } from '@/features/entries/config/entry-type-config'

const creationSteps = [
  {
    title: 'Uploader múltiple',
    description:
      'Una entrada podrá recibir varias capturas antes de guardar nada.',
  },
  {
    title: 'OCR encapsulado',
    description:
      'Tesseract.js queda aislado en un servicio para poder reemplazarlo luego.',
  },
  {
    title: 'Análisis IA seguro',
    description:
      'Groq se consumirá desde `api/analyze.ts` para no exponer la key.',
  },
  {
    title: 'Formulario dinámico',
    description:
      'Los campos cambian según el tipo detectado y todo se podrá editar.',
  },
]

export function NewEntryPage() {
  return (
    <section className="page">
      <div className="section-title">
        <h1>Pantalla de nueva entrada</h1>
        <p>
          Esta base visual ya marca el recorrido real del MVP y la distribución
          de responsabilidades.
        </p>
      </div>

      <div className="card-grid card-grid--two">
        <article className="card">
          <h2>Etapas de carga</h2>
          <div className="steps">
            {creationSteps.map((step, index) => (
              <div className="step" key={step.title}>
                <span className="step__index">{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>Campos por tipo</h2>
          <div className="field-grid">
            {entryTypeOptions.map((option) => (
              <div className="field-card" key={option.type}>
                <strong>{option.label}</strong>
                <p>{option.fields.join(', ')}</p>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}
