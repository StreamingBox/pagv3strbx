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
const appBuildId = `${process.env.npm_package_version || '0.0.0'}-${Date.now()}`;

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(appBuildId),
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // ── Todo lo que comience con /api va al Node backend (cubre auth, admin, upload, branding...) ──
      '/api': { target: backendTarget, changeOrigin: true, bypass: apiOnly },

      // ── Rutas sin prefijo /api (legacy, mantenidas por compatibilidad) ──
      '/auth': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/catalog': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/wallet': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/orders': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/platforms': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/codes': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      '/support': { target: backendTarget, changeOrigin: true, bypass: apiOnly },
      // Links de credenciales compartidas
      '/s/': { target: backendTarget, changeOrigin: true },
    }
  }
})
