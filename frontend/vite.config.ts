import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react-swc"
import { defineConfig, loadEnv } from "vite"
import { VitePWA } from "vite-plugin-pwa"

const getAllowedHosts = (url?: string) => {
  if (!url) return []
  return url
    .split(",")
    .map((item) => {
      const trimmed = item.trim()
      if (!trimmed) return null
      try {
        const parsed = new URL(
          trimmed.includes("://") ? trimmed : `http://${trimmed}`,
        )
        return parsed.hostname
      } catch {
        return trimmed.replace(/^https?:\/\//, "").split(/[:/]/)[0]
      }
    })
    .filter((host): host is string => Boolean(host))
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const appName = env.VITE_APP_NAME || process.env.VITE_APP_NAME
  const appShortName = env.VITE_APP_NAME || process.env.VITE_APP_NAME
  const allowedHosts = getAllowedHosts(
    env.VITE_APP_URL || process.env.VITE_APP_URL,
  )

  return {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "favicon.svg",
          "assets/images/favicon.png",
          "assets/images/favicon-light.png",
          "assets/images/hitungbiz-logo.png",
          "apple-touch-icon.png",
          "maskable-icon-512x512.png",
          "pwa-192x192.png",
          "pwa-512x512.png",
          "offline.html",
        ],
        manifest: {
          name: appName,
          short_name: appShortName,
          description: "Accounting and Bookkeeping Platform",
          theme_color: "#09090b",
          background_color: "#09090b",
          display: "standalone",
          orientation: "portrait",
          start_url: "/",
          scope: "/",
          lang: "en",
          categories: ["finance", "business", "productivity"],
          icons: [
            {
              src: "/pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "/maskable-icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api/, /^\/uploads/],
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
          runtimeCaching: [
            {
              urlPattern: /^\/api\/.*$/,
              handler: "NetworkFirst",
              options: {
                cacheName: "api-cache",
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 5,
                },
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "images-cache",
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
            {
              urlPattern: /\.(?:js|css|woff2?|eot|ttf|otf)$/i,
              handler: "CacheFirst",
              options: {
                cacheName: "static-resources",
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    server: {
      host: "0.0.0.0",
      allowedHosts: allowedHosts.length > 0 ? allowedHosts : undefined,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
          secure: false,
        },
        "/uploads": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
