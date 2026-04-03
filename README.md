# Streaming Box v3

Monorepo de `Streaming Box` con frontend web en React/Vite, backend en Node.js/Express y recursos para APK Android con Capacitor.

Versión actual: `1.1.4`

## Estructura

```text
pagv3strbx/
├── backend/          API, lógica de negocio, auth, órdenes, renovaciones, códigos
├── frontend/         Panel web, dashboard de usuario, admin, APK Android
├── go-backend/       Servicios auxiliares heredados/en transición
├── scripts/          Scripts de apoyo
├── deploy.sh         Script de despliegue
└── ecosystem.config.cjs
```

## Stack principal

- Frontend: React 19 + Vite
- Backend: Node.js + Express
- Base de datos: MySQL
- Android: Capacitor + Gradle
- Otros: IMAP, Telegram Bot, Nodemailer, WhatsApp integrations

## Requisitos

- Node.js 20+ recomendado
- npm
- MySQL
- Android SDK y JDK si vas a compilar la APK

## Instalación

Desde la raíz:

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

O con el script del monorepo:

```bash
npm run install-all
```

## Variables de entorno

El backend usa `backend/.env`.

Entre las variables importantes están:

- `PORT`
- `DB_HOST`
- `DB_USER`
- `DB_PASS`
- `DB_NAME`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `PUBLIC_BASE_URL`
- `FRONTEND_URL`
- `GMAIL_EMAIL`
- `GMAIL_IMAP_PASS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_IDS`

## Desarrollo local

Levantar backend:

```bash
cd backend
npm run dev
```

Levantar frontend:

```bash
cd frontend
npm run dev
```

Levantar ambos desde la raíz:

```bash
npm run dev
```

## Scripts útiles

Raíz:

```bash
npm run dev
npm run install-all
```

Backend:

```bash
cd backend
npm run dev
npm start
```

Frontend:

```bash
cd frontend
npm run dev
npm run build
npm run preview
npm run android:sync
npm run android:open
npm run android:run
```

## Build de frontend

```bash
cd frontend
npm run build
```

Salida:

```text
frontend/dist/
```

## APK Android

La app Android usa Capacitor y envuelve `https://strbx.com.co`.

Archivos clave:

- `frontend/capacitor.config.json`
- `frontend/android/`
- `frontend/ANDROID_BUILD.md`

Compilar release:

```bash
cd frontend/android
./gradlew assembleRelease
```

APK release:

```text
frontend/android/app/build/outputs/apk/release/app-release.apk
```

APK pública usada para descarga:

```text
frontend/public/downloads/streaming-box-android.apk
```

## Firma Android

La build release usa:

- `frontend/android/keystore.properties`
- `frontend/android/*.jks`

Esos archivos no deben perderse. Sin la misma clave de firma no podrás publicar actualizaciones sobre la misma app instalada.

## Despliegue

El repo incluye:

- `deploy.sh`
- `ecosystem.config.cjs`

Según el entorno, normalmente el flujo es:

1. actualizar el repo
2. instalar dependencias
3. compilar frontend
4. reiniciar procesos del backend

## Notas

- El backend expone rutas públicas y privadas bajo `/api`.
- Existen vistas admin para órdenes, renovaciones, inventario, vencimientos, logs de códigos y soporte.
- Hay integración con links compartidos `/s/:token` para mostrar credenciales temporales.
- En inventario, el campo `ID Venta` solo debe mostrarse cuando la cuenta tiene una suscripción activa asociada; si no existe venta activa, debe quedar vacío.
- El inventario permite abrir una tarjeta responsive por cuenta con credenciales, orden actual, fechas, trazabilidad de reemplazo y línea de tiempo de ventas/reemplazos.
- Desde inventario también se puede abrir soporte sin salir de la página, copiar mensaje/link y ejecutar reemplazos.
- En soporte y en inventario, un reemplazo puede usar la siguiente cuenta disponible o una cuenta específica seleccionada manualmente.
- Los links compartidos de credenciales vencidos se depuran automáticamente al iniciar el backend, cada hora y también al intentar abrir un token expirado.
- Los logs de códigos ya incluyen diagnóstico por motivo para facilitar soporte.

## Estado del repo

Rama principal:

```text
main
```

Remoto principal:

```text
https://github.com/StreamingBox/pagv3strbx.git
```
