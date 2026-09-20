import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Charts and drag-and-drop are heavy and change rarely — splitting them
        // keeps the app chunk small enough to stay cacheable between deploys.
        // Matched by id rather than package name because @tiptap/pm exposes
        // subpaths only, so naming it as an entry fails to resolve.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/node_modules[\/](@tiptap|prosemirror-)/.test(id)) return 'editor'
          if (/node_modules[\/](react|react-dom|react-router|react-router-dom)[\/]/.test(id)) return 'react'
          if (/node_modules[\/]recharts[\/]/.test(id)) return 'charts'
          if (/node_modules[\/]@dnd-kit[\/]/.test(id)) return 'dnd'
        },
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      // Only used when VITE_API_MODE=http and VITE_API_BASE_URL is left as /api
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
