import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'CMMS Nutrialimentos',
        short_name: 'Mantenimiento',
        description: 'Mantenimiento e inventario de repuestos – Nutrialimentos Cárnicos',
        lang: 'es-CO',
        start_url: '/',
        display: 'standalone',
        background_color: '#f4f5f2',
        theme_color: '#1d3b2f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // La API nunca se sirve desde caché en este sprint; el modo offline llega en el Sprint 3.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
  preview: {
    proxy: { '/api': 'http://localhost:3000' },
  },
});
