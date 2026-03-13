import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      // All /api and /auth calls → BFF
      '/api':      { target: 'http://bff:4000', changeOrigin: true },
      '/auth':     { target: 'http://bff:4000', changeOrigin: true },
      '/webhooks': { target: 'http://bff:4000', changeOrigin: true },
    }
  }
})
