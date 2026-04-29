# Mi Agente

MVP PWA mobile-first para guardar contenido personal a partir de capturas de pantalla. La captura es la fuente principal: se suben una o varias imágenes, se corre OCR, se consolida el texto, se analiza con IA y la persona revisa antes de guardar.

## Estado actual

Esta primera etapa deja lista la base técnica:

- Proyecto inicializado con React + TypeScript + Vite.
- PWA configurada con `vite-plugin-pwa`.
- Estructura por features preparada para crecer sin rehacer todo.
- Dependencias núcleo instaladas.
- Esquema SQL inicial para Supabase con RLS y bucket privado.
- Base visual mínima para home, auth, creación y detalle.

## Stack

- Frontend: React 19 + TypeScript + Vite 7
- Routing: `react-router-dom`
- PWA: `vite-plugin-pwa`
- Auth / DB / Storage: Supabase
- Formularios: `react-hook-form`
- Validación: `zod`
- OCR MVP: `tesseract.js`
- IA serverless: `groq-sdk`
- Deploy: Vercel

## Dependencias elegidas

- `@supabase/supabase-js`: cliente único para auth, Postgres y Storage.
- `react-router-dom`: navegación simple para login, home, creación y detalle.
- `react-hook-form` + `@hookform/resolvers` + `zod`: formularios fuertes sin sobrecargar la app.
- `tesseract.js`: OCR gratis y encapsulado para poder cambiarlo más adelante.
- `groq-sdk`: integración serverless con Groq sin exponer la API key.
- `vite-plugin-pwa`: instalación como app y soporte offline básico.
- `clsx`: utilitario mínimo para clases condicionales.

## Estructura

```text
api/
public/
src/
  app/
  components/
  features/
    ai/
    auth/
    entries/
    ocr/
  integrations/
    supabase/
  lib/
  types/
supabase/
  migrations/
```

## Variables de entorno

Crear un `.env` a partir de `.env.example`:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
GROQ_API_KEY=
META_APP_ID=
META_APP_SECRET=
META_OEMBED_ACCESS_TOKEN=
```

Para leer posts de Instagram de forma confiable en links pegados, la opcion estable es configurar credenciales de Meta para `instagram_oembed`.
Puedes usar:

- `META_OEMBED_ACCESS_TOKEN`: token listo para usar.
- o `META_APP_ID` + `META_APP_SECRET`: la app arma el app token `app_id|app_secret`.

Sin una de esas opciones, Instagram puede bloquear la lectura real del contenido y solo quedaran fallbacks parciales.

## Setup local

1. Instalar dependencias:

```bash
npm install
```

2. Ejecutar en desarrollo:

```bash
npm run dev
```

3. Validar tipos:

```bash
npm run typecheck
```

4. Generar build:

```bash
npm run build
```

## Supabase

La migración inicial está en:

- [20260420_000001_initial_schema.sql](./supabase/migrations/20260420_000001_initial_schema.sql)

Incluye:

- `entries` como tabla principal.
- `entry_images` para múltiples capturas por entrada.
- `entry_items` contemplada para una segunda etapa.
- RLS por usuario.
- Bucket privado `entry-images`.
- Políticas de Storage por carpeta `user_id/...`.

### Decisiones de esquema

- `metadata_json` concentra los campos variables por tipo y evita sobredimensionar la primera versión.
- `ai_tags` se guarda como `text[]` para simplificar filtros iniciales.
- `entry_items` queda creada pero no será requisito del primer flujo funcional.
- `source_type` y `status` permiten crecer más adelante sin romper el modelo base.

## PWA

La PWA ya quedó activada con auto update. Para el MVP inicial se usan iconos SVG simples; antes de pasar a producción conviene reemplazarlos por PNG maskable dedicados.

## Próximas etapas sugeridas

1. Implementar Supabase Auth y protección de rutas.
2. Conectar CRUD real de `entries`.
3. Agregar uploader múltiple + Storage.
4. Integrar OCR encapsulado.
5. Implementar endpoint `api/analyze.ts` con Groq + validación estricta.
6. Construir formulario dinámico prellenado y guardado final.

## Primer commit lógico sugerido

```bash
chore: bootstrap mi agente pwa foundation
```
