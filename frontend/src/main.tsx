import { registerSW } from "virtual:pwa-register"
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { ApiError, OpenAPI } from "./client"
import { ThemeProvider } from "./components/theme-provider"
import { Toaster } from "./components/ui/sonner"
import "./index.css"
import { routeTree } from "./routeTree.gen"

// Register Progressive Web App (PWA) Service Worker with automatic updates
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Force immediate update and page reload when new content is available
    updateSW(true)
  },
  onOfflineReady() {
    console.log("PWA is ready to work offline.")
  },
  onRegisteredSW(swUrl, r) {
    if (r) {
      // Periodically check for SW updates (every 15 minutes)
      setInterval(
        async () => {
          if (!navigator.onLine) return
          try {
            const resp = await fetch(swUrl, {
              cache: "no-store",
              headers: { "cache-control": "no-cache" },
            })
            if (resp?.status === 200) {
              await r.update()
            }
          } catch {}
        },
        15 * 60 * 1000,
      )
    }
  },
})

// Expose the PWA install event for future custom install button integration
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault()
  ;(window as any).deferredInstallPrompt = e
})

OpenAPI.BASE = import.meta.env.VITE_API_URL
OpenAPI.TOKEN = async () => {
  return localStorage.getItem("access_token") || ""
}

const clearAuthState = () => {
  localStorage.removeItem("access_token")
  localStorage.removeItem("company_id")
  localStorage.removeItem("role")
}

const isLimitReachedError = (error: Error) => {
  if (!(error instanceof ApiError)) return false
  const detail = (error.body as any)?.detail
  return (
    detail?.error === "LIMIT_REACHED" ||
    (typeof detail === "object" && detail?.error === "LIMIT_REACHED")
  )
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error: Error) => {
      if (
        error instanceof ApiError &&
        [401, 403].includes(error.status) &&
        !isLimitReachedError(error)
      ) {
        clearAuthState()
        queryClient.clear()
        window.location.href = "/login"
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error: Error) => {
      if (
        error instanceof ApiError &&
        [401, 403].includes(error.status) &&
        !isLimitReachedError(error)
      ) {
        clearAuthState()
        queryClient.clear()
        window.location.href = "/login"
      }
    },
  }),
})

const router = createRouter({ routeTree })
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
