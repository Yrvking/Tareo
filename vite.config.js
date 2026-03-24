import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'favicon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      manifest: {
        id: "/",
        start_url: "/",
        name: 'Tareador - Control de Horas',
        short_name: 'Tareador',
        description: 'Aplicación para el control de horas hombre en proyectos de construcción',
        theme_color: '#0a192f',
        background_color: '#0a192f',
        display: "standalone",
        orientation: "portrait",
        dir: "ltr",
        categories: ["productivity", "business", "utilities"],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        screenshots: [
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Tareador View'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Tareador Mobile View'
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    port: 3000,
    open: false
  }
})
