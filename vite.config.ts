import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  preview: {
    allowedHosts: ['dre.snitelecom.com.br', '147.15.57.112']
  }
})
