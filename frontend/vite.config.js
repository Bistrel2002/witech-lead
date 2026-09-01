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
        // The vitrine is the site root: a visitor typing the domain must
        // land on the product presentation, not on a login form. The app
        // moves to /app.html — see Login.jsx, which sends its own path as
        // the OAuth redirect_uri so sign-in returns to the app rather than
        // to the marketing page.
        landing: path.resolve(here, 'index.html'),
        app: path.resolve(here, 'app.html')
      }
    }
  },
  server: {
    host: true,
    port: 5173
  }
})
