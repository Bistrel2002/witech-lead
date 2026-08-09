import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    rollupOptions: {
      input: {
        // index stays the app: OAuth redirects point at the site root and
        // moving the app off it would break Google sign-in.
        main: path.resolve(here, 'index.html'),
        landing: path.resolve(here, 'landing.html')
      }
    }
  },
  server: {
    host: true,
    port: 5173
  }
})
