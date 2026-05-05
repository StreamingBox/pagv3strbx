# Streaming Box v3 — Documento de Diseño

Versión actual: `1.1.4` | Rama: `main`

---

## 1. Visión general

**Streaming Box** es una plataforma de venta y gestión de cuentas de streaming (Netflix, Disney+, HBO Max, etc.). El sistema permite a los usuarios comprar suscripciones, renovarlas, gestionar códigos de acceso y recibir soporte. Los administradores tienen un panel completo para gestionar inventario, precios, usuarios, analíticas y comunicaciones vía WhatsApp y Telegram.

El proyecto está organizado como un **monorepo** con:

- `backend/` — API REST en Node.js/Express
- `frontend/` — SPA en React 19 + Vite, con soporte para APK Android vía Capacitor
- `go-backend/` — Microservicios auxiliares en Go (en transición)
- `scripts/` — Scripts de utilidad
- `deploy.sh` y `ecosystem.config.cjs` — Despliegue con PM2

---

## 2. Stack tecnológico

### Backend

| Componente | Tecnología |
|---|---|
| Runtime | Node.js 20+ |
| Framework | Express 4 |
| Base de datos | MySQL 8 (vía `mysql2` con pool de conexiones) |
| Autenticación | JWT (access + refresh tokens), bcrypt, cookies httpOnly |
| Email | Nodemailer + IMAP (Gmail) |
| Mensajería | WhatsApp Business API + Telegram Bot |
| Archivos | Multer, Google Drive API (Service Account) |
| Despliegue | PM2 en VPS Linux |

### Frontend

| Componente | Tecnología |
|---|---|
| Framework | React 19 |
| Build tool | Vite 7 |
| Ruteo | React Router Dom 7 |
| Animaciones | Framer Motion 11 |
| Estilos | CSS-in-JS con variables CSS + `special-effects.css` para fondos |
| Gráficos | Recharts |
| HTTP | Fetch API con helpers (`apiGet`, `apiPost`, `apiDelete`, `apiFetch`) |
| Code splitting | `React.lazy()` + `Suspense` |
| Android | Capacitor + Gradle |

---

## 3. Arquitectura del backend

### 3.1 Entry point

`backend/src/index.js` — Configura Express, CORS, helmet, cookie-parser, rutas y middleware. Las migraciones de base de datos se ejecutan inline en `db.js` mediante `CREATE TABLE IF NOT EXISTS` al iniciar el servidor. **No se usan archivos de migración separados.**

### 3.2 Middleware

| Middleware | Archivo | Función |
|---|---|---|
| `requireAuth` | `middleware/requireAuth.js` | Verifica JWT access token desde cookie o header `Authorization` |
| `requireRole(role)` | `middleware/requireRole.js` | Restringe acceso por rol (`admin`, `user`) |

### 3.3 Estructura de rutas

Todas las rutas se montan bajo `/api` en `index.js`. Se organizan por dominio:

```
/api/auth/*           — Autenticación, registro, recuperación de contraseña
/api/admin/*          — Panel de administración (usuarios, órdenes, inventario, etc.)
/api/catalog/*        — Catálogo de productos
/api/orders/*         — Órdenes y compras de usuarios
/api/codes/*          — Gestión de códigos de acceso
/api/wallet/*         — Billetera y recargas
/api/platforms/*      — Plataformas de streaming
/api/support/*        — Soporte técnico
/api/whatsapp/*       — Integración WhatsApp
/api/branding/*       — Logo y assets de marca
/api/advertising/*    — Publicidad con Google Drive
```

### 3.4 Base de datos

Las tablas se crean automáticamente en `backend/src/db.js` al iniciar. No existe un sistema de migraciones versionado. Cada `CREATE TABLE IF NOT EXISTS` incluye `ALTER TABLE` para agregar columnas nuevas sin romper instalaciones existentes.

**Tablas principales:** `users`, `platforms`, `prices`, `accounts`, `orders`, `codes`, `code_deliveries`, `transactions`, `manual_topups`, `support_tickets`, `conversations`, `whatsapp_logs`, `advertising_images`, `branding`, `upload_logs`.

---

## 4. Sistema de Publicidad con Google Drive

### 4.1 Motivación

Las imágenes publicitarias suelen ser archivos de alta calidad y peso considerable. Almacenarlas en el servidor principal consumiría ancho de banda, espacio en disco y ralentizaría los deploys. La solución: usar un **Google Drive externo** (de otro correo) como CDN gratuito, conectado mediante una **Service Account** de Google Cloud.

### 4.2 Flujo de datos

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Admin UI   │────▶│  Backend API  │────▶│ Google Drive │     │   MySQL DB   │
│ (React SPA)  │◀────│  (Express)    │◀────│    API v3    │     │advertising_  │
│ /admin/adv   │     │ /api/admin/   │     │              │     │   images     │
└──────────────┘     │  advertising  │     └──────────────┘     └──────────────┘
                     └──────────────┘
                            │
┌──────────────┐            │
│   User UI    │────────────┘
│ (React SPA)  │
│ /advertising │
└──────────────┘
```

1. **Subida:** El admin selecciona imágenes → multer las almacena temporalmente en `.tmp-uploads/` → se suben a Google Drive vía API → se hacen públicas (permiso `reader`/`anyone`) → se guardan metadatos en MySQL → se eliminan los temporales.
2. **Listado admin:** Se consulta Google Drive por las carpetas e imágenes → se cruza con MySQL para obtener metadatos (activo/inactivo, orden) → se devuelve el merge.
3. **Listado usuario:** Solo se muestran carpetas con imágenes `is_active = true`. Se usa una sola consulta SQL global (`getFolderMetaMap`) para evitar N+1 queries.
4. **Descarga:** El frontend genera links directos `https://drive.google.com/uc?export=download&id=FILE_ID`. El navegador descarga desde Google directamente, sin pasar por el backend.

### 4.3 Componentes del backend

#### 4.3.1 `services/googleDriveService.js`

Servicio de abstracción sobre Google Drive API v3. Autentica con JWT usando la Service Account.

**Métodos:**

| Método | Descripción |
|---|---|
| `listFolders()` | Lista carpetas hijas de `PARENT_FOLDER_ID` (solo primer nivel) |
| `listImagesInFolder(folderId)` | Lista archivos con MIME `image/*` dentro de una carpeta |
| `createFolder(name)` | Crea una carpeta dentro de la raíz |
| `deleteFolder(folderId)` | Elimina carpeta y todo su contenido en Drive |
| `renameFolder(folderId, newName)` | Renombra una carpeta |
| `uploadImage(folderId, filePath, name, mime)` | Sube un archivo, lo hace público, devuelve metadata |
| `uploadImages(folderId, files)` | Sube múltiples archivos (array de multer), limpia temporales en `finally` |
| `deleteFile(fileId)` | Elimina un archivo de Drive |
| `getDownloadLink(fileId)` | Genera link de descarga directa (`uc?export=download`) |
| `getPreviewLink(fileId)` | Genera link de previsualización (`uc?export=view`) |
| `getFileInfo(fileId)` | Obtiene metadata completa de un archivo |
| `makeFilePublic(fileId)` | Otorga permiso `reader`/`anyone`, ignora error "already exists" |
| `formatDriveError(error)` | Traduce errores de la API de Google a mensajes en español |

**Manejo de la private key:**

```javascript
const key = (process.env.GOOGLE_DRIVE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
```

Esto cubre tanto el caso de variables de entorno locales (con saltos de línea reales) como el de plataformas cloud que escapan los `\n` a `\\n`.

#### 4.3.2 `routes/admin.advertising.js`

Rutas protegidas con `requireAuth` + `requireRole("admin")`.

| Método | Ruta | Body/Params | Respuesta |
|---|---|---|---|
| `GET` | `/admin/advertising/folders` | — | `{ ok, data: [{ id, name, createdTime, imageCount }] }` |
| `POST` | `/admin/advertising/folders` | `{ name }` | `{ ok, data: { id, name, createdTime } }` |
| `PUT` | `/admin/advertising/folders/:id` | `{ name }` | `{ ok, data: folder }` |
| `DELETE` | `/admin/advertising/folders/:id` | — | `{ ok, message }` |
| `GET` | `/admin/advertising/images/:folderId` | — | `{ ok, data: [imágenes con merge Drive+DB] }` |
| `POST` | `/admin/advertising/images/:folderId` | `multipart/form-data` con campo `images` (múltiple) | `{ ok, data: [archivos subidos], message }` |
| `PATCH` | `/admin/advertising/images/:fileId/toggle` | — | `{ ok, is_active: bool }` |
| `PATCH` | `/admin/advertising/images/:fileId/sort` | `{ sort_order }` | `{ ok }` |
| `DELETE` | `/admin/advertising/images/:fileId` | — | `{ ok, message }` |

**Middleware multer:** Límite 50MB, filtro de tipos (`image/jpeg, image/png, image/webp, image/gif`), destino temporal `.tmp-uploads/`.

**Estrategia de merge (GET images):** Se listan archivos de Drive, se consulta MySQL por `file_id`, se combinan priorizando metadatos de DB. Las imágenes sin registro en DB se consideran activas por defecto.

**Eliminación de carpeta:** Primero se borran registros de MySQL (`DELETE FROM advertising_images WHERE folder_id = ?`), luego se elimina en Drive. Esto evita registros huérfanos si Drive falla.

#### 4.3.3 `routes/advertising.js`

Rutas protegidas solo con `requireAuth` (accesibles para admin y user).

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/advertising/folders` | Carpetas con imágenes activas (omite carpetas vacías) |
| `GET` | `/advertising/images/:folderId` | Imágenes activas de una carpeta |
| `GET` | `/advertising/all` | Todas las carpetas con sus imágenes activas (agrupado) |

**Helpers internos:**

- `normalizeImageRow(row)` — Normaliza una fila de MySQL a objeto JS consistente.
- `getFolderMetaMap()` — Ejecuta **una sola consulta** `SELECT * FROM advertising_images` y construye dos Maps: `metaByFolder` (folder_id → folder_name) y `metaByFile` (file_id → metadata normalizada). Esto evita el problema N+1.
- `getFolderImages(folderId, metaByFile)` — Lista archivos de Drive, los mergea con el Map de metadatos, filtra solo activos (`isActive = true`) y ordena por `sort_order ASC, created_at DESC`.

### 4.4 Tabla `advertising_images`

```sql
CREATE TABLE IF NOT EXISTS advertising_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    folder_name VARCHAR(255) NOT NULL,
    folder_id VARCHAR(255) NULL,
    file_name VARCHAR(255) NOT NULL,
    file_id VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NULL DEFAULT 'image/jpeg',
    web_view_link TEXT NULL,
    thumbnail_link TEXT NULL,
    image_size INT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_advertising_folder (folder_name),
    INDEX idx_advertising_active (is_active),
    INDEX idx_advertising_sort (sort_order)
);
```

**Columnas clave:**

- `file_id` — ID del archivo en Google Drive (clave para el merge Drive↔DB).
- `web_view_link` y `thumbnail_link` — Se persisten para evitar llamadas redundantes a la API de Drive en cada listado.
- `is_active` — Controla visibilidad para usuarios. Solo el admin puede togglear.
- `sort_order` — Permite ordenamiento manual de imágenes dentro de una carpeta.

### 4.5 Componentes del frontend

#### 4.5.1 `AdminAdvertising.jsx` (576 líneas)

Panel de administración con layout de dos paneles responsivos:

```
┌──────────────────────────────────────────────────────┐
│ 📢 Publicidad              [📁 5 carpetas] [⟳ Refresh]│
├──────────────┬───────────────────────────────────────┤
│ 📁 Carpetas  │ 📂 Carpeta seleccionada               │
│              │ [⬆ Subir imágenes]                     │
│ [+ Crear]    │                                       │
│              │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│ 📁 Promos    │ │ img1 │ │ img2 │ │ img3 │ │ img4 │  │
│   3 imágenes │ │      │ │      │ │      │ │      │  │
│              │ │ Vis  │ │ Ocul │ │ Vis  │ │ Vis  │  │
│ 📁 Ofertas   │ │ ⬇ 🗑 │ │ ⬇ 🗑 │ │ ⬇ 🗑 │ │ ⬇ 🗑 │  │
│   5 imágenes │ └──────┘ └──────┘ └──────┘ └──────┘  │
│              │                                       │
│ 📁 Eventos   │                                       │
│   0 imágenes │                                       │
└──────────────┴───────────────────────────────────────┘
```

**Funcionalidades:**

- **Carpetas:** crear (input + botón), renombrar inline (doble acción: Drive + MySQL), eliminar con modal de confirmación (elimina de MySQL primero, luego Drive).
- **Imágenes:** upload múltiple (input `type="file" multiple` con `FormData`), grid con thumbnail, toggle visibilidad (PATCH optimista), descarga directa (link a Google), eliminar con confirmación.
- **Badge "OCULTA":** Overlay semitransparente sobre imágenes inactivas.
- **Mensajes:** Toast de éxito/error con `AnimatePresence` de framer-motion, auto-dismiss a los 3-4 segundos.
- **Indicadores:** Contador de carpetas, tamaño total de la carpeta seleccionada, número de imágenes.
- **Responsive:** En pantallas ≤980px, los paneles se apilan verticalmente con scroll natural.
- **Hover actions:** Los botones de renombrar/eliminar carpeta aparecen solo al hacer hover.
- **Code splitting:** Carga lazy con `React.lazy()`.

#### 4.5.2 `Advertising.jsx` (264 líneas)

Vista de usuario con flujo en dos pasos:

```
Paso 1: Selección de carpeta          Paso 2: Imágenes + preview modal
┌────────────────────────┐           ┌──────────────────────────────┐
│ 📢 Publicidad          │           │ ← Volver  📂 Promos  5 img   │
│                        │           │                              │
│ ┌──────┐ ┌──────┐     │           │ ┌──────┐ ┌──────┐ ┌──────┐  │
│ │ 📁   │ │ 📁   │     │  click →  │ │      │ │      │ │      │  │
│ │Promos│ │Ofertas│    │           │ │ img1 │ │ img2 │ │ img3 │  │
│ │3 img │ │5 img │     │           │ │      │ │      │ │      │  │
│ └──────┘ └──────┘     │           │ │⬇ Desc│ │⬇ Desc│ │⬇ Desc│  │
└────────────────────────┘           │ └──────┘ └──────┘ └──────┘  │
                                     └──────────────────────────────┘
                                              │ click en imagen
                                              ▼
                                     ┌──────────────────────┐
                                     │     Lightbox Modal    │
                                     │  ┌────────────────┐  │
                                     │  │                │  │
                                     │  │   Vista previa │  │
                                     │  │   (grande)     │  │
                                     │  │                │  │
                                     │  └────────────────┘  │
                                     │  nombre.jpg  ⬇ Desc  │
                                     └──────────────────────┘
```

**Funcionalidades:**

- **Grid de carpetas:** Cards con ícono, nombre y contador de imágenes. Animación de elevación al hover.
- **Grid de imágenes:** Thumbnails con zoom suave al hover. Botón de descarga prominente con gradiente azul-violeta.
- **Modal de preview:** Overlay con blur, imagen a tamaño completo, botón de cierre y descarga.
- **Navegación:** Botón "← Volver" para regresar a la selección de carpetas.
- **Sidebar:** Usa el `Sidebar` de usuario (no `AdminSidebar`), con acceso completo a navegación.
- **Datos:** Solo consume endpoints públicos (`/advertising/*`), que filtran automáticamente imágenes inactivas.

### 4.6 Navegación

**Admin sidebar** (`AdminSidebar.jsx`): La entrada de Publicidad está en el grupo **"Cuentas & Inventario"** con ícono 📢 y ruta `/admin/advertising`.

**User sidebar** (`Sidebar.jsx`): La entrada está en el `NAV_ITEMS` como `{ key: "advertising", label: "Publicidad", icon: "📢", path: "/advertising" }`. Se pasa el handler `onGoAdvertising` desde `Dashboard.jsx` que navega a `/advertising`.

### 4.7 Variables de entorno requeridas

```env
# Google Drive — Publicidad
GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL=tu-service-account@tu-proyecto.iam.gserviceaccount.com
GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_PARENT_FOLDER_ID=1a2b3c4d5e6f7g8h9i0j
```

---

## 5. Sistema de autenticación

### 5.1 Flujo JWT

1. **Registro/Login:** El backend valida credenciales, genera `accessToken` (corta duración) y `refreshToken` (larga duración).
2. **Cookies:** Ambos tokens se envían como cookies `httpOnly`, `secure` (en producción), `sameSite: "lax"`.
3. **Middleware `requireAuth`:** Extrae el access token de la cookie o del header `Authorization: Bearer <token>`. Si expiró, intenta renovarlo con el refresh token.
4. **Roles:** El middleware `requireRole` verifica `user.role` contra los roles permitidos.

### 5.2 Protección de rutas en frontend

El componente `<ProtectedRoute roles={[...]}>` envuelve las rutas privadas. Si el usuario no tiene el rol requerido, redirige a `/dashboard` o `/admin` según corresponda.

---

## 6. Inventario y cuentas

### 6.1 Flujo de compra

1. Usuario selecciona plataforma, duración y perfil.
2. Se genera una orden con estado `pending`.
3. Al pagar (saldo de billetera), la orden pasa a `completed`.
4. Se asigna una cuenta del inventario a la orden.
5. El usuario recibe las credenciales vía WhatsApp y/o las ve en "Mis Códigos".

### 6.2 Renovaciones

- Las órdenes próximas a vencer pueden renovarse manualmente.
- Una renovación genera una nueva orden `RENO-*` y extiende la fecha de expiración.
- El mensaje de WhatsApp se guarda como último mensaje entregable.
- Se notifica a Telegram con el bloque completo para copiar al cliente.

### 6.3 Reemplazos

- Si una cuenta falla, el admin puede ejecutar un reemplazo desde Inventario o Soporte.
- El reemplazo puede usar la siguiente cuenta disponible o una cuenta específica.
- Queda registro en `support_tickets` con trazabilidad completa.

---

## 7. Sistema de WhatsApp y Telegram

### 7.1 WhatsApp Business API

- Integración directa con la API de WhatsApp Cloud.
- Envío de credenciales, códigos de verificación y mensajes de soporte.
- Logs en `whatsapp_logs` con trazabilidad de cada mensaje.
- El admin puede ver la traza completa en `/admin/whatsapp-trace`.

### 7.2 Telegram Bot

- Notificaciones de nuevas órdenes, renovaciones y alertas de stock.
- Comandos registrados para admins autorizados (definidos en `TELEGRAM_CHAT_IDS`).
- Modo polling activo al iniciar el backend.

---

## 8. Netflix — Flujo de códigos especiales

Netflix tiene tres flujos separados por su sistema de verificación:

| Flujo | Descripción | Restricción |
|---|---|---|
| **Inicio** | Código de inicio de sesión | Correos válidos solo 15 min. Bloqueo mutuo con aprobación por pedido/credencial. |
| **Aprobación** | Nueva solicitud de inicio | Igual bloqueo que inicio. |
| **Temporal** | Acceso temporal | Solo 1 entrega OK por pedido/credencial. |

El log queda en `code_deliveries.message` con formato `OK:code`, `OK:approve` u `OK:temporary`.

---

## 9. Links compartidos de credenciales

- Ruta: `/s/:token`
- Muestra credenciales temporales con cuenta regresiva.
- Los tokens expirados se depuran al iniciar el backend, cada hora y al intentar abrir uno vencido.
- El frontend redirige a un componente `CredentialRedirect` que muestra la info o un mensaje de expiración.

---

## 10. Frontend — Convenciones y patrones

### 10.1 Estructura de componentes

```
src/
├── api/              — Helpers HTTP (apiGet, apiPost, etc.)
├── components/
│   ├── admin/        — AdminSidebar
│   ├── app/          — FullPageLoader, InstallAppPrompt
│   ├── auth/         — StandaloneAuthLayout
│   ├── dashboard/    — Sidebar, UserNotifications
│   └── text/         — BalancedText
├── context/          — AuthContext (React Context + useReducer)
├── hooks/            — useTheme, useAppLogout
├── pages/            — Componentes de página (Dashboard, Admin*, Advertising, etc.)
├── routes/           — ProtectedRoute
└── styles/           — special-effects.css (orbes, grids de fondo)
```

### 10.2 Patrones de código

- **CSS-in-JS:** Todos los estilos se definen como objetos JS inline, usando variables CSS (`var(--bg0)`, `var(--text)`, `var(--stroke)`, `var(--muted)`, `var(--font)`, etc.).
- **Tema oscuro/claro:** Detectado con `useTheme()` hook. Las variables CSS cambian automáticamente.
- **Framer Motion:** `motion.div`, `AnimatePresence` para transiciones de entrada/salida, `whileHover`, `whileTap` para interacciones.
- **Lazy loading:** Páginas no críticas se importan con `React.lazy()` y se envuelven en `<Suspense>`.
- **Manejo de errores:** Capturados con `try/catch`, mostrados en toasts animados que se cierran al click o con timeout.
- **Helper HTTP:** `apiGet`, `apiPost`, `apiDelete`, `apiFetch` — wrappers sobre `fetch` que incluyen credenciales, manejo de tokens y parseo JSON.
- **`buildApiUrl`:** Construye URLs absolutas usando `API_BASE` configurable.

### 10.3 Diseño responsive

- **Breakpoint principal:** 980px (sidebar collapsa, layouts pasan a stacked).
- **Ancho máximo de contenido:** 1600px centrado.
- **Sidebar:** En móvil se oculta y muestra con toggle ☰. Overlay semitransparente al abrir.
- **Grids:** `grid-template-columns: repeat(auto-fill, minmax(...))` para adaptarse automáticamente.

---

## 11. Despliegue

### 11.1 Flujo típico

1. `git pull` en el VPS.
2. `npm run install-all` para instalar dependencias.
3. `cd frontend && npm run build` para compilar el SPA.
4. Los binarios Go se recompilan si cambiaron (validando Go 1.26.2+).
5. `pm2 restart ecosystem.config.cjs --env production --update-env`.

### 11.2 Requisitos del entorno

- `INTERNAL_SERVICE_TOKEN` debe estar configurado en producción.
- Los binarios Go se compilan con `CGO_ENABLED=0` para máxima compatibilidad.
- PM2 gestiona los procesos del backend Node y los microservicios Go.

---

## 12. APK Android

- La APK se construye con Capacitor + Gradle.
- Archivos de firma: `frontend/android/keystore.properties` y `frontend/android/*.jks`.
- **Sin la misma clave de firma no se pueden publicar actualizaciones** sobre la misma app instalada.
- La APK pública se sirve desde `frontend/public/downloads/streaming-box-android.apk`.
- El `versionName` y `versionCode` del Gradle determinan el `__APK_RELEASE_ID__` para detectar nuevas versiones.

---

## 13. Seguridad

- **JWT rotativo:** Access token de corta duración, refresh token para renovación silenciosa.
- **Cookies httpOnly:** Los tokens no son accesibles desde JavaScript.
- **CORS configurado:** Solo permite `FRONTEND_URL` en producción.
- **Helmet:** Headers de seguridad HTTP.
- **Rate limiting:** No implementado actualmente (pendiente).
- **Validación de entrada:** Multer filtra tipos MIME y tamaño máximo. Los parámetros de ruta se validan implícitamente al consultar Drive/MySQL.
- **Errores de Google Drive:** `formatDriveError` traduce errores de API a mensajes genéricos sin exponer detalles internos.

---

## 14. Estado actual y próximos pasos

### Completado

- ✅ CRUD de carpetas e imágenes en Google Drive
- ✅ Panel admin con toggle de visibilidad y ordenamiento
- ✅ Galería pública con descarga directa
- ✅ Persistencia de metadatos en MySQL
- ✅ Limpieza automática de temporales
- ✅ Navegación integrada en sidebars admin y user
- ✅ Merge Drive + DB para sincronización bidireccional

### Pendiente / Mejoras futuras

- [ ] Edición de orden de imágenes vía drag & drop en el admin
- [ ] Soporte para videos promocionales (MP4 en Drive)
- [ ] Estadísticas de visualización/descarga por imagen
- [ ] Programación de publicidad (fechas de inicio/fin)
- [ ] Caché de thumbnails en el frontend (localStorage/service worker)
