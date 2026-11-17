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
    // Explicit IPv4 loopback: plain 'localhost' made Vite bind only to ::1,
    // which SSH / VS Code port forwarding to 127.0.0.1 can't reach.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})