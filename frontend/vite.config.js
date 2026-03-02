import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// función de bypass: solo proxear peticiones XHR/Fetch, no navegaciones del browser
function apiOnly(req) {
  // Si es una navegación directa del browser (Accept: text/html), NO proxear -> Vite sirve el SPA
  const accept = req.headers?.accept || '';
  if (accept.includes('text/html')) {
    return req.url; // devuelve la URL sin cambios = Vite responde con index.html
  }
  // De lo contrario, proxear al backend (XHR, fetch, etc.)
  return undefined;
}

const backendTarget = 'http://localhost:3000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Rutas de autenticación
      '/auth': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      // Rutas de API de datos
      '/catalog': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/wallet': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/orders': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/platforms': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/codes': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/support': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      // Links de credenciales compartidas
      '/s/': { target: backendTarget, changeOrigin: true },
      // Rutas de admin (solo API, no UI)
      '/admin/users': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/admin/orders': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/admin/platforms': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/admin/accounts': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/admin/analytics': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/admin/transactions': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/admin/inventory': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/admin/renewals': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/admin/expirations': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/admin/code-logs': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/admin/prices': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/admin/categories': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/admin/durations': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
    }
  }
})
