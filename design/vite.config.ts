import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Flask (app.py, PORT = 8765) is a separate process in dev - proxy
    // /api so httpListingsRepository.ts's fetch("/api/...") calls reach it
    // without needing CORS headers on the Flask side.
    proxy: {
      '/api': 'http://127.0.0.1:8765',
    },
  },
})
