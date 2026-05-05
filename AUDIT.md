# Auditoría Integral — Streaming Box v1.1.4

## Seguridad

### Fortalezas
- Helmet con CSP, HSTS, `frame-ancestors 'none'`, `crossOriginResourcePolicy: "cross-origin"`
- JWT con refresh token rotativo, hash SHA-256 en BD, `crypto.randomUUID()` como `jwtid`, revocación
- bcrypt con cost factor 12
- Rate limiting por endpoint: login (8/min), códigos (400/hr), links compartidos (8/min), global (450/hr)
- Sanitización anti-prototype-pollution (`__proto__`, `constructor`, `prototype`)
- Cookies HttpOnly + Secure + SameSite Strict
- Validación de configuración en producción: secrets JWT ≥ 32 chars, `WASENDER_SKIP_SIGNATURE` bloqueado
- `trust proxy` configurado para IP real detrás de Nginx
- `express.urlencoded` con `parameterLimit: 200` y `depth: 5`
- Verificación de magic bytes en logos de plataforma (`hasAllowedImageSignature`)
- Lock de instancia única del backend

---

### Hallazgos

#### `crossOriginOpenerPolicy` y `crossOriginEmbedderPolicy` ausentes
- **Archivo**: `backend/src/index.js`
- **Criticidad**: 🔴 Crítico
- COOP/COEP son la defensa primaria contra ataques de canal lateral (Spectre, XS-Leaks). Helmet está configurado pero sin estas directivas.
- **Acción**: Agregar `crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }` y evaluar `crossOriginEmbedderPolicy`.

---

#### `.env` real en el proyecto
- **Archivo**: `backend/.env`
- **Criticidad**: 🔴 Crítico
- El archivo `.env` existe en el filesystem con valores reales. Si alguna vez se commitea, las claves JWT, DB, SMTP, Google Drive y WaSender quedan expuestas.
- **Acción**: Verificar que `.env` esté en `.gitignore` y confirmar que no tiene commits en el historial. Agregar `.env` a un hook de pre-commit que lo bloquee explícitamente.

---

#### Google Drive private key como variable de entorno plana
- **Archivo**: `backend/src/services/googleDriveService.js`
- **Criticidad**: 🔴 Crítico
- `GOOGLE_DRIVE_PRIVATE_KEY` es una clave PEM completa. Un leak del `.env` da acceso total al Drive compartido.
- **Acción**: Evaluar Google Secret Manager. Como mínimo, rotar la key si hay sospecha de exposición.

---

#### Access token cookie con `path: "/"`
- **Archivo**: `backend/src/routes/auth.js`
- **Criticidad**: 🟠 Alto
- El access token usa `path: "/"` (toda la app), mientras el refresh token usa `path: "/api/auth"`. Esto expone el access token a assets estáticos innecesariamente.
- **Acción**: Cambiar a `path: "/api"`.

---

#### `sameSite: "strict"` rompe flujos cross-site
- **Archivo**: `backend/src/routes/auth.js`
- **Criticidad**: 🟠 Alto
- Navegaciones desde email (reset de contraseña, verificación) no enviarán cookies con Strict. La seguridad es buena pero la UX se rompe.
- **Acción**: Evaluar `sameSite: "lax"` que permite GET desde links externos.

---

#### Sin rate limiting en forgot-password y reset-password
- **Archivo**: `backend/src/index.js`
- **Criticidad**: 🟠 Alto
- Solo aplica el rate global de 450/hr. Permite enumeración de usuarios y fuerza bruta de tokens de reset de 6 dígitos.
- **Acción**: Agregar `forgotPasswordRateLimit` de 3 req/min por IP sobre esos endpoints.

---

#### CSP permite `'unsafe-inline'` en scripts
- **Archivo**: `backend/src/index.js`
- **Criticidad**: 🟡 Medio
- `script-src: ["'self'", "'unsafe-inline'"]` debilita protección XSS. Necesario para React dev pero peligroso en prod.
- **Acción**: En producción, cambiar a `'strict-dynamic'` con hash del script inline o usar nonces.

---

#### Multer no sanitiza `originalname` en upload de publicidad
- **Archivo**: `backend/src/routes/admin.advertising.js`
- **Criticidad**: 🟡 Medio
- `admin.upload.js` usa `slugifyFilename` pero `admin.advertising.js` pasa `file.originalname` directo a Google Drive sin sanitización.
- **Acción**: Sanitizar o slugificar el nombre antes de subir a Drive.

---

#### Timeout HTTP del servidor muy bajo para uploads
- **Archivo**: `backend/src/index.js`
- **Criticidad**: 🟡 Medio
- `requestTimeout: 30000` (30s) es insuficiente para uploads de 50MB a Google Drive en conexiones lentas.
- **Acción**: Aumentar a 120s o ignorar timeout en rutas de upload.

---

#### `.env.example` incompleto
- **Archivo**: `backend/.env.example`
- **Criticidad**: 🟡 Medio
- Faltan: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_DAYS`, `GOOGLE_DRIVE_*`, `TELEGRAM_*`, `WASENDER_*`, etc.
- **Acción**: Listar todas las variables requeridas con descripción y ejemplo de formato (sin valores reales).

---

## Diseño

### Fortalezas
- Sistema de theming dark/light con variables CSS y `data-theme`
- Framer Motion para animaciones fluidas en transiciones y microinteracciones
- Orbes de fondo y grid decorativo consistentes en todas las páginas
- `BalancedText` para evitar viudas tipográficas
- Estados vacíos con iconos y mensajes descriptivos
- Spinners de carga con animación CSS y color acento

---

### Hallazgos

#### CSS-in-JS masivo en Auth.jsx
- **Archivo**: `frontend/src/pages/Auth.jsx` (834 líneas)
- **Criticidad**: 🟠 Alto
- El objeto `S` define ~40 estilos inline. Dificulta el mantenimiento, no se beneficia de cache del navegador, y es imposible de inspeccionar en DevTools.
- **Acción**: Migrar a CSS Modules o archivos `.css` con clases. Mantener solo estilos dinámicos inline.

---

#### Dos implementaciones distintas del Sidebar
- **Archivos**: `Sidebar.jsx` (456 líneas) vs `AdminSidebar.jsx` (373 líneas)
- **Criticidad**: 🟠 Alto
- El sidebar de usuario usa framer-motion con `AnimatePresence`, `layoutId`, `motion.button`. El admin usa CSS puro con `onMouseEnter/Leave` manuales. Mismo patrón UI, dos codebases.
- **Acción**: Extraer `AppSidebar` base con slots/variantes por rol.

---

#### Item `advertising` duplicado en `NAV_ITEMS`
- **Archivo**: `frontend/src/components/dashboard/Sidebar.jsx`
- **Criticidad**: 🟢 Bajo
- La entrada de publicidad aparece dos veces en el array. Se filtra con `.findIndex` pero es propenso a bugs de mantenimiento.
- **Acción**: Eliminar la entrada duplicada.

---

#### Glass morphism sin deshabilitar en móviles de gama baja
- **Criticidad**: 🟡 Medio
- `backdrop-filter: blur(16px)` es pesado en GPU. En dispositivos de gama baja causa lag y alto consumo de batería.
- **Acción**: Deshabilitar blur con `@media (max-width: 900px)` y respetar `prefers-reduced-motion`.

---

#### Sin focus states visibles en elementos interactivos
- **Archivos**: `Dashboard.jsx`, `Auth.jsx`, `AdminSidebar.jsx`
- **Criticidad**: 🟡 Medio
- Los `div` clickeables (nav items, carpetas, imágenes) no tienen `:focus-visible`. Rompe navegación por teclado (WCAG 2.1 AA).
- **Acción**: Agregar `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`.

---

#### Contraste insuficiente en texto muted sobre fondos claros
- **Criticidad**: 🟡 Medio
- `var(--muted)` → `#64748b` sobre `var(--card)` → `rgba(255,255,255,0.9)` en tema claro puede no cumplir ratio 4.5:1.
- **Acción**: Auditar con axe-core o Lighthouse y ajustar `--muted` para tema claro.

---

#### Sin indicador visual de página activa en el título
- **Criticidad**: 🟡 Medio
- El `<h1>` muestra el título pero no hay breadcrumb ni indicador de profundidad ("Admin > Publicidad").
- **Acción**: Crear componente `Breadcrumbs` con `useLocation()`.

---

## Navegabilidad

### Fortalezas
- Lazy loading de ~25 páginas con `React.lazy()` y `Suspense`
- `ProtectedRoute` con soporte para array de roles y redirección por rol
- `RedirectByRole` para ruta catch-all `*`
- `InstallAppPrompt` para instalación PWA en Android
- Sidebar colapsable en móvil con overlay y toggle

---

### Hallazgos

#### Sin breadcrumbs en ninguna página
- **Archivo**: `frontend/src/App.jsx`
- **Criticidad**: 🟠 Alto
- Con ~30 rutas admin y varias secciones anidadas, el usuario no tiene referencia de dónde está ni cómo volver.
- **Acción**: Implementar `<Breadcrumbs />` usando `useLocation()` y un mapa `path → label`. Ubicarlo bajo el header de cada página.

---

#### Sidebar colapsado sin tooltips en mobile
- **Archivo**: `AdminSidebar.jsx`
- **Criticidad**: 🟡 Medio
- En mobile solo se ven iconos. El `title` nativo no funciona bien en touch. El usuario no sabe qué hace cada icono.
- **Acción**: Mostrar labels en mobile o implementar tooltip táctil con long-press.

---

#### Estados vacíos inconsistentes
- **Criticidad**: 🟡 Medio
- `AdminAdvertising.jsx` tiene estados vacíos con íconos grandes y mensajes claros. Otras páginas (órdenes, wallet) pueden carecer de ellos.
- **Acción**: Crear `<EmptyState icon title subtitle action />` reutilizable.

---

#### "Server Status: Online" hardcodeado
- **Archivo**: `frontend/src/components/dashboard/Sidebar.jsx`
- **Criticidad**: 🟢 Bajo
- Indicador estático. No verifica conectividad real — siempre dice Online aunque el backend esté caído.
- **Acción**: Hacer ping periódico a `/api/health` y mostrar estado real.

---

## Rendimiento

### Fortalezas
- Lazy loading de páginas admin con React.lazy y Suspense
- `useMemo` en filtros y cálculos del catálogo (categorías, filteredCatalog)
- `useCallback` en loadFolders y loadImages
- `loading="lazy"` en imágenes de publicidad
- Pool de conexiones MySQL2 con keepAlive

---

### Hallazgos

#### Migraciones ALTER TABLE en cada arranque
- **Archivo**: `backend/src/db.js`
- **Criticidad**: 🔴 Crítico
- ~80 queries `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` se ejecutan en cada inicio del backend. En producción cada deploy golpea la DB innecesariamente — suma latencia y riesgo.
- **Acción**: Implementar sistema de migraciones versionado con tabla `schema_migrations`. Solo ejecutar queries nuevas.

---

#### Consultas N+1 a Google Drive API en ruta pública
- **Archivo**: `backend/src/routes/advertising.js`
- **Criticidad**: 🟠 Alto
- `getFolderMetaMap()` hace una sola query a MySQL, pero `getFolderImages()` llama a `driveService.listImagesInFolder(folderId)` por cada carpeta. Con 10 carpetas son 11 llamadas a Drive API.
- **Acción**: Cachear resultados de Drive con TTL de 60s o usar batch requests.

---

#### Sin React Query / SWR — fetch manual sin cache
- **Archivo**: `frontend/src/pages/AdminAdvertising.jsx`
- **Criticidad**: 🟠 Alto
- Cada operación CRUD llama manualmente a `loadFolders()` y `loadImages()`. No hay deduplicación, cache, ni revalidación automática. El usuario ve spinners en cada interacción aunque los datos no hayan cambiado.
- **Acción**: Implementar TanStack Query (React Query) para estado del servidor. Mutaciones optimistas en toggle de visibilidad.

---

#### `recharts` (~300KB) incluido en bundle principal
- **Archivo**: `frontend/package.json`
- **Criticidad**: 🟡 Medio
- Se usa solo en páginas admin de analíticas. Cargarlo en el bundle principal penaliza a todos los usuarios.
- **Acción**: Lazy-load recharts solo en rutas que lo usan: `const Analytics = lazy(() => import("./pages/Analytics"))`.

---

#### Sin compresión Brotli de assets
- **Archivo**: `frontend/vite.config.js`
- **Criticidad**: 🟡 Medio
- Los bundles JS/CSS no se comprimen en build. En producción depende de Nginx, pero Vite puede generar `.br` estáticos.
- **Acción**: Agregar `vite-plugin-compression` con algoritmo `brotli`.

---

#### `getFolderMetaMap()` sin paginación
- **Archivo**: `backend/src/routes/advertising.js`
- **Criticidad**: 🟡 Medio
- `SELECT * FROM advertising_images` carga todas las filas. Con cientos de imágenes esto degradará.
- **Acción**: Agregar paginación o filtrar por `is_active = 1` ya que la ruta pública solo necesita activas.

---

#### `useMemo` y `useCallback` inconsistentes
- **Archivo**: `AdminSidebar.jsx`
- **Criticidad**: 🟡 Medio
- `fetchStockCount`, `fetchExpirations`, `fetchTopups` son funciones casi idénticas creadas nuevas en cada render. Los `useEffect` dependientes se re-ejecutan innecesariamente.
- **Acción**: Extraer en hook `usePolledFetch(url, intervalMs)` con `useCallback`.

---

## Código

### Fortalezas
- Arquitectura limpia: `routes/` → `services/` → `db`
- Separación de responsabilidades: `auth/tokens.js`, `services/`, `middleware/`
- `requireRole("admin")` como middleware encadenado
- Transacciones en operaciones críticas (refresh token, creación de cuentas, reset password)
- `api.js` con retry automático de refresh en 401

---

### Hallazgos

#### God Component: Auth.jsx con 834 líneas
- **Archivo**: `frontend/src/pages/Auth.jsx`
- **Criticidad**: 🔴 Crítico
- Contiene login, registro, forgot password, theming, selector de países, T&C, banners APK, y 40 estilos CSS-in-JS. Imposible de testear o modificar sin romper algo.
- **Acción**: Extraer en: `<LoginForm>`, `<RegisterForm>`, `<CountrySelector>`, `<TermsModal>`, `<SuccessView>`, `<ThemeToggle>`. Usar composición.

---

#### Duplicación severa: AdminAdvertising vs Advertising
- **Archivos**: `AdminAdvertising.jsx` (576 líneas), `Advertising.jsx` (264 líneas)
- **Criticidad**: 🟠 Alto
- Comparten: `formatSize`, estructura `page-shell > page-inner > main`, header con icono 48px, grid de carpetas/imágenes, preview modal, spinners, estados vacíos. Código copiado con variaciones mínimas.
- **Acción**: Extraer: `<AdvertisingHeader>`, `<FolderGrid>`, `<ImageGrid>`, `<ImagePreviewModal>`, `<EmptyFolderState>`. Admin y User usan los mismos componentes con props `editable`.

---

#### `logout()` reimplementado en AdminAdvertising
- **Archivo**: `frontend/src/pages/AdminAdvertising.jsx`
- **Criticidad**: 🟠 Alto
- Tiene una función `logout()` manual de 7 líneas con `localStorage.removeItem` y `window.location.href`. `Dashboard.jsx` usa `useAppLogout` correctamente. Inconsistencia.
- **Acción**: Usar `useAppLogout` en todas las páginas.

---

#### Upload de imágenes usa `fetch()` en vez de `apiFetch`
- **Archivo**: `frontend/src/pages/AdminAdvertising.jsx`
- **Criticidad**: 🟠 Alto
- `handleUploadFiles` usa `fetch(buildApiUrl(...))` directo mientras el resto del código usa `apiFetch`. No se beneficia del refresh automático de token en 401.
- **Acción**: Extender `apiFetch` para soportar `FormData` (no serializar a JSON si body es FormData) y usar `apiFetch` en el upload.

---

#### `pool.query(...).catch(() => {})` silencia todos los errores
- **Archivo**: `backend/src/db.js` (~80 ocurrencias)
- **Criticidad**: 🟡 Medio
- Si una migración falla por razón legítima (conflicto de tipos, tabla corrupta), el error se traga y nunca se diagnostica.
- **Acción**: Loguear con `console.warn` los errores que no sean "Duplicate column name".

---

#### JavaScript sin tipos
- **Criticidad**: 🟡 Medio
- Todo el proyecto es JS puro. Los servicios de Google Drive, auth y rutas no tienen JSDoc. Los objetos de respuesta no tienen forma conocida sin leer el código.
- **Acción**: Agregar tipos JSDoc en servicios (`googleDriveService.js`, `auth/tokens.js`) como paso inicial. Evaluar migración incremental a TypeScript en backend.

---

#### Constantes mágicas dispersas
- **Criticidad**: 🟡 Medio
- `WA_NUMBER = "573152485340"` hardcodeado en `Auth.jsx`. Timeouts `15000`, `8000`, `30000` en `api.js`. `COP` como moneda default en múltiples lugares.
- **Acción**: Centralizar en `shared/constants.js` o `config.js`.

---

#### `conn.release()` propenso a fugas
- **Archivo**: `backend/src/routes/auth.js`
- **Criticidad**: 🟡 Medio
- En refresh y reset-password se llama `conn.release()` en cada `if` antes del `return`. Si se agrega un nuevo early return sin release, hay fuga de conexiones del pool.
- **Acción**: Usar helper `withConnection(pool, async (conn) => { ... })` que garantice release en finally.

---

#### Comentarios inconsistentes
- **Archivo**: `backend/src/db.js`
- **Criticidad**: 🟢 Bajo
- Mezcla de `//`, `/* */`, `// ───` y `// ✅` sin estándar definido.
- **Acción**: Definir y seguir un estándar (ej. JSDoc para funciones, `//` para inline).

---

## Resumen por criticidad

| Criticidad | Cantidad | Áreas |
|---|---|---|
| 🔴 Crítico | 5 | `.env` expuesto, COOP/COEP ausente, migraciones en cada arranque, God Component Auth.jsx, private key Drive en variable plana |
| 🟠 Alto | 12 | Duplicación AdminAdvertising/Advertising, CSS-in-JS masivo, sin breadcrumbs, N+1 a Drive API, accessToken path `/`, sin React Query, logout reimplementado, inconsistencias sidebar, forgot-password sin rate limit, sameSite strict, upload con fetch directo |
| 🟡 Medio | 15 | CSP unsafe-inline, sin focus states, glass-morphism en móvil, sin paginación advertising, recharts en bundle principal, sin compresión brotli, `useMemo`/`useCallback` inconsistentes, `.env.example` incompleto, multer sin sanitizar, timeout HTTP bajo, errores silenciados en migraciones, sin tipos, constantes mágicas, `conn.release` propenso a fugas, sin tooltips en mobile, estados vacíos inconsistentes, contraste insuficiente |
| 🟢 Bajo | 4 | Item advertising duplicado en NAV_ITEMS, server status hardcodeado, comentarios inconsistentes, breadcrumbs de página ausentes |

## Prioridades recomendadas

1. **Verificar que `.env` no esté commiteado** y rotar secretos si hay duda
2. **Crear sistema de migraciones versionado** para eliminar ~80 ALTER TABLEs del startup
3. **Refactorizar Auth.jsx** en componentes pequeños (LoginForm, RegisterForm, TermsModal, etc.)
4. **Extraer componentes compartidos** de Advertising: FolderGrid, ImageGrid, ImagePreviewModal, EmptyState
5. **Agregar rate limiting** en forgot-password y reset-password
6. **Implementar React Query** para estado del servidor en Advertising
7. **Unificar Sidebar** en un componente base con variantes admin/user
8. **Agregar COOP/COEP** en helmet
9. **Crear Breadcrumbs** para navegación admin
10. **Agregar focus states** en elementos interactivos para accesibilidad
