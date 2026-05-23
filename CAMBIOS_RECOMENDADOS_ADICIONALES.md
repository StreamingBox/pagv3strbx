# Streaming Box v3 — Plan de Optimizaciones Avanzadas (Revisado con Seguridad)

Este documento detalla el diseño técnico final para las últimas optimizaciones propuestas, incorporando validación condicional ETag/304 de alta precisión con soporte para comodines, la carga perezosa de DevTools en desarrollo y el orden de ejecución recomendado para evitar fricciones.

---

## 🔒 1. Caché Semántica de Seguridad para Publicidad (ETag / 304)

### El Reto de Seguridad
Si marcamos la ruta `/advertising/file/:fileId` con una caché agresiva (`public, max-age=31536000, immutable`), los navegadores, proxies y CDNs intermedios servirán la imagen en el edge sin consultar a nuestro backend. Esto introduce tres problemas críticos:
1. **Fuga de Autorización**: La ruta protege las imágenes mediante tokens o sesiones. Si un CDN la cachea públicamente, cualquiera podría descargarla sin autenticarse.
2. **Inconsistencia de Visibilidad de Carpeta e Imagen**: Si el administrador oculta la imagen (`i.is_active = 0`) o la carpeta contenedora (`f.is_active = 0`), los usuarios con la imagen cacheada seguirán visualizándola.
3. **Imágenes Sincronizadas sin Hash**: Las imágenes subidas por la app tienen `file_hash` SHA-256, pero las imágenes importadas por sincronización directa de Google Drive pueden tener `file_hash = NULL`.

### La Solución: Validación Condicional Precisa con ETag Débil y Comodines
1. Usamos la cabecera `Cache-Control: private, no-cache, must-revalidate`. La directiva `private` garantiza que solo el navegador del usuario almacene la imagen (nunca un proxy o CDN público).
2. Generamos un **ETag débil** (`W/`):
   * Si existe `file_hash`, lo usamos directamente.
   * Si `file_hash` es `NULL`, creamos un hash dinámico débil combinando el `file_id`, el tamaño `image_size` y la fecha de creación `created_at` (utilizamos `created_at` en lugar de `updated_at` porque es 100% estable y no sufre actualizaciones innecesarias durante las sincronizaciones del administrador).
3. Validamos la visibilidad cruzada (unión de `advertising_images` con `advertising_folders`) consultando en MySQL. Si la imagen o la carpeta están inactivas, bloqueamos de inmediato (HTTP 403).
4. Parseamos la cabecera `If-None-Match` del cliente soportando el comodín asterisco `*` (RFC 7232) y colecciones separadas por comas, eliminando el prefijo débil `W/` para una comparación robusta.
5. Si coincide, respondemos con **`304 Not Modified`**, devolviendo también las cabeceras `ETag` y `Cache-Control` correspondientes para actualizar la metadata en el cliente.

### Implementación del Código
Reemplaza la ruta del streaming en [backend/src/routes/advertising.js](file:///c:/Users/deyby/OneDrive/Documentos/Desarrollos/pageV3/backend/src/routes/advertising.js#L96) con la siguiente lógica refinada:

```javascript
// Función helper para comparar ETags según RFC 7232
function matchEtag(clientHeader, serverEtag) {
    if (!clientHeader || !serverEtag) return false;

    const cleanHeader = clientHeader.trim();
    if (cleanHeader === "*") return true; // ⚡ Soporte para comodín de coincidencia global

    // Normalizar quitando el prefijo W/ y comillas dobles
    const normalize = (tag) => tag.replace(/^W\//i, "").replace(/"/g, "").trim();

    const serverNorm = normalize(serverEtag);
    const clientNorms = cleanHeader.split(",").map(normalize);

    return clientNorms.includes(serverNorm);
}

router.get("/advertising/file/:fileId", requireFileAccess, async (req, res) => {
    try {
        const { fileId } = req.params;

        // 1. Consultar metadatos locales uniendo imagen y carpeta de manera unificada
        const [rows] = await pool.query(
            `SELECT
                i.file_name,
                i.mime_type,
                i.file_hash,
                i.image_size,
                i.created_at,
                i.is_active AS image_active,
                COALESCE(f.is_active, 1) AS folder_active
               FROM advertising_images i
               LEFT JOIN advertising_folders f ON f.folder_id = i.folder_id
              WHERE i.file_id = ?
              LIMIT 1`,
            [fileId]
        );

        if (!rows.length) {
            return res.status(404).json({ ok: false, message: "Imagen no encontrada en el inventario." });
        }

        const cachedImg = rows[0];

        // 🔒 SEGURIDAD: Bloquear acceso si la imagen o su carpeta padre están ocultas
        if (cachedImg.image_active === 0 || cachedImg.folder_active === 0) {
            return res.status(403).json({ ok: false, message: "Acceso no autorizado a este recurso." });
        }

        // Generar ETag fuerte (si hay file_hash) o débil robusto y estable usando created_at
        let etagValue = cachedImg.file_hash;
        if (!etagValue) {
            const ctime = cachedImg.created_at ? new Date(cachedImg.created_at).getTime() : 0;
            etagValue = `${fileId}-${cachedImg.image_size || 0}-${ctime}`;
        }
        const etag = `W/"${etagValue}"`;

        // ⚡ VALIDACIÓN CONDICIONAL: Comparar ETag con soporte para comodín y listas de ETags
        if (matchEtag(req.headers["if-none-match"], etag)) {
            res.setHeader("Cache-Control", "private, no-cache, must-revalidate");
            res.setHeader("ETag", etag); // RFC 7232 exige ETag en respuestas 304
            return res.status(304).end();
        }

        // 2. Si no coincide o expiró, solicitar flujo a Google Drive
        const { meta, stream } = await driveService.getFileStream(fileId);
        const isDownload = String(req.query.download || "").trim() === "1";

        res.setHeader("Content-Type", meta?.mimeType || cachedImg.mime_type || "application/octet-stream");
        res.setHeader(
            "Content-Disposition",
            `${isDownload ? "attachment" : "inline"}; filename="${encodeURIComponent(meta?.name || cachedImg.file_name || fileId)}"`
        );

        if (!isDownload) {
            res.setHeader("Cache-Control", "private, no-cache, must-revalidate");
            res.setHeader("ETag", etag);
        } else {
            res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
        }

        stream.on("error", (err) => {
            console.error("[advertising/file stream]", err.message);
            if (!res.headersSent) {
                res.status(500).end("Error leyendo archivo.");
            } else {
                res.end();
            }
        });
        stream.pipe(res);
    } catch (err) {
        console.error("[advertising/file]", err.message);
        const status = driveErrorStatus(err);
        res.status(status).json({
            ok: false,
            message: driveErrorMessage(err, "No se pudo leer el archivo.", req.params.fileId),
        });
    }
});
```

---

## 🛠️ 2. DevTools de TanStack Query (Solo en Desarrollo)

Para asegurar que las herramientas de depuración no formen parte del bundle final de producción, cargaremos el componente dinámicamente y de forma perezosa condicionada a `import.meta.env.DEV`.

### Implementación en `main.jsx`
Modifica tu archivo principal [frontend/src/main.jsx](file:///c:/Users/deyby/OneDrive/Documentos/Desarrollos/pageV3/frontend/src/main.jsx#L48) de la siguiente manera:

```javascript
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./styles/auth.css";
import "./styles/adminSupport.css";

import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { clearLegacySession } from "./api/api.js";
import { queryClient } from "./queryClient.js";

// Componente para cargar dinámicamente DevTools en local
const ReactQueryDevtoolsLazy = React.lazy(() =>
    import("@tanstack/react-query-devtools").then((d) => ({
        default: d.ReactQueryDevtools,
    }))
);

// ... lógica de temas ...

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </BrowserRouter>
            {/* Carga diferida condicional de DevTools solo en DEV */}
            {import.meta.env.DEV && (
                <React.Suspense fallback={null}>
                    <ReactQueryDevtoolsLazy initialIsOpen={false} />
                </React.Suspense>
            )}
        </QueryClientProvider>
    </React.StrictMode>
);
```

---

## 🧹 3. Limpieza de ESLint (PR / Rama Separada)

Dado que la corrección de linting afectará a múltiples archivos y podría generar ruido visual en las revisiones de código de negocio, se recomienda realizarla en una pasada totalmente aislada.

### Pasos Sugeridos
1. Correr el diagnóstico estático:
   ```bash
   cd frontend
   npm run lint
   ```
2. Ejecutar la autocorrección estructurada de sintaxis y formateo:
   ```bash
   npx eslint . --fix
   ```
3. Resolver manualmente advertencias complejas, de forma que no se mezcle con las lógicas de base de datos ni Google Drive.
