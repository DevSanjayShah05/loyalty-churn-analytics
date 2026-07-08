import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Foot & Frequency frontend. In dev, /api is proxied to the FastAPI backend
// (uvicorn on :8000). In production the app expects the API on the same origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
