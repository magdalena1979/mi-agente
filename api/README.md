Las funciones serverless de Vercel van a vivir en esta carpeta.

Próximo archivo esperado para el MVP:

- `api/analyze.ts`: recibe el texto OCR consolidado, llama a Groq, valida la respuesta con `zod` y devuelve JSON normalizado.
