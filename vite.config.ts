import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

import { analyzeEntryPayload } from './api/_lib/analyze-entry'

function analyzeEntryDevPlugin(groqApiKey: string | undefined): PluginOption {
  return {
    name: 'mi-agente-analyze-entry-dev',
    configureServer(server) {
      server.middlewares.use('/api/analyze-entry', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed.' }))
          return
        }

        try {
          const chunks: Uint8Array[] = []

          for await (const chunk of req) {
            chunks.push(
              typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk),
            )
          }

          const body = chunks.length
            ? JSON.parse(Buffer.concat(chunks).toString('utf8'))
            : {}

          const result = await analyzeEntryPayload(body, groqApiKey)

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (error) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : 'No pudimos analizar la entrada.',
            }),
          )
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    plugins: [
      react(),
      analyzeEntryDevPlugin(env.GROQ_API_KEY),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
          enabled: false,
        },
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'The Things We Share',
          short_name: 'We Share',
          description:
            'PWA para guardar y compartir cosas que te interesan desde capturas, links, OCR e IA.',
          theme_color: '#111111',
          background_color: '#111111',
          display: 'standalone',
          start_url: '/',
          orientation: 'portrait',
          icons: [
            {
              src: '/favicon_io/android-chrome-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/favicon_io/android-chrome-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/favicon_io/android-chrome-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
  }
})
