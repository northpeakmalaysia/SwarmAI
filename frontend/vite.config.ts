import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3202,
    host: '0.0.0.0',
    allowedHosts: ['agents.northpeak.app'],
    proxy: {
      '/api': {
        target: 'http://localhost:3031',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3032',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
