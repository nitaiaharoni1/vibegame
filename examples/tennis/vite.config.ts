import { defineConfig } from 'vite'

export default defineConfig({
  assetsInclude: ['**/*.vgx'],
  optimizeDeps: {
    exclude: ['@vigame/renderer-three'],
  },
})
