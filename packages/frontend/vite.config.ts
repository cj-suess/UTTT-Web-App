import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Force Vite to pre-bundle @uttt/shared via esbuild, which converts its
    // CommonJS output to ESM. Without this, Vite treats workspace symlinks as
    // local source and serves the raw CJS file — which browsers can't parse.
    include: ['@uttt/shared'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})