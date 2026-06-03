import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'icon-192.png',
        'icon-512.png',
        'icon-192.jpg',
        'icon-512.jpg',
      ],
      workbox: {
        // 预缓存所有静态资源
        globPatterns: [
          '**/*.{js,css,html,ico,png,jpg,svg,woff2}',
        ],
        // 排除 wasm（太大且运行时加载）
        globIgnores: ['**/node_modules/**/*.wasm'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        // 运行时缓存策略
        runtimeCaching: [
          // CDN: MediaPipe Vision WASM 和 JS
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mediapipe-cdn',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 天
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // CDN: Google Fonts（如果有）
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 年
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 年
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // 图片资源
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 天
              },
            },
          },
        ],
      },
      manifest: {
        name: '体态游乐场 PosturePlay',
        short_name: 'PosturePlay',
        description: '看见你的尾巴——实时姿态可视化与每日运势',
        theme_color: '#0f0f1a',
        background_color: '#0f0f1a',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'zh-CN',
        categories: ['health', 'lifestyle', 'utilities'],
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
