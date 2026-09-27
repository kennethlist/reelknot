import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    // Same-origin tile proxy for Print Maps (mirrors the nginx rule in production).
    proxy: {
      '/tiles': {
        target: 'https://basemap.nationalmap.gov',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/tiles/, '/arcgis/rest/services/USGSTopo/MapServer/tile'),
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        maps: fileURLToPath(new URL('./maps.html', import.meta.url)),
      },
    },
  },
})
