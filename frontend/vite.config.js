import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
    // En desarrollo el frontend llama a rutas relativas (/api/...) igual que en
    // produccion, y este proxy las reenvia al backend local. Asi no hay que
    // cambiar ninguna URL entre local y Vercel.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
