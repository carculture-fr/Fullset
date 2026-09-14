import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"

// Pages de l'API qu'on garde pour la consultation hors ligne (brocante sans réseau, cave, salon).
// Les fonctions sont recopiées telles quelles dans le service worker : pas de variable extérieure.
const offlineApi = ({ url }: { url: URL }) =>
  ["/api/library", "/api/hardware", "/api/lists", "/api/barcodes", "/api/wishlist", "/api/stats", "/api/stats/summary", "/api/auth/me", "/api/health", "/api/preferences"].includes(url.pathname) ||
  /^\/api\/(games|hardware)\/\d+$/.test(url.pathname)

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Le manifeste reste public/manifest.webmanifest, déjà référencé par index.html.
      manifest: false,
      injectRegister: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,webmanifest}"],
        navigateFallback: "/index.html",
        // Ces adresses sont servies par le serveur, jamais par la coque de l'application.
        navigateFallbackDenylist: [/^\/api\//, /^\/connexion\//, /^\/courriel\//, /^\/covers\//, /^\/photos\//],
        runtimeCaching: [
          {
            urlPattern: offlineApi,
            handler: "NetworkFirst",
            options: { cacheName: "gc-api", networkTimeoutSeconds: 4, expiration: { maxEntries: 400 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/covers/") || url.pathname.startsWith("/photos/"),
            handler: "CacheFirst",
            options: { cacheName: "gc-images", expiration: { maxEntries: 3000, maxAgeSeconds: 90 * 86400 }, cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // Listes de valeurs partagées avec le serveur : une seule source.
      "@domain": path.resolve(import.meta.dirname, "../server/src/domain.ts"),
    },
  },
  server: {
    port: 5176,
    // xfwd : l'API voit l'hôte d'origine (X-Forwarded-Host) et accepte les écritures du site.
    proxy: {
      "/api": { target: "http://localhost:3110", xfwd: true },
      "/covers": { target: "http://localhost:3110", xfwd: true },
      "/photos": { target: "http://localhost:3110", xfwd: true },
    },
  },
})
