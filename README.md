# Streaming Box v3

Monorepo de `Streaming Box` con frontend web en React/Vite, backend en Node.js/Express y recursos para APK Android con Capacitor.

Versión actual: `1.1.4`

## Estructura

```text
pagv3strbx/
├── backend/          API, lógica de negocio, auth, órdenes, renovaciones, códigos
├── frontend/         Panel web, dashboard de usuario, admin, APK Android
├── scripts/          Scripts de apoyo
├── deploy.sh         Script de despliegue
└── ecosystem.config.cjs
```

## Stack principal

- Frontend: React 19 + Vite
- Backend: Node.js + Express
- Base de datos: MySQL
- Android: Capacitor + Gradle
- Otros: IMAP, Telegram Bot, Nodemailer

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
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_DRIVE_PRIVATE_KEY`
- `GOOGLE_DRIVE_PARENT_FOLDER_ID`

### Publicidad con Google Drive

El sistema de publicidad permite almacenar imágenes promocionales de alta calidad en un Google Drive externo (de otro correo distinto al del hosting), sin recargar el servidor principal. Las imágenes se organizan por carpetas, se administran desde el panel admin y se muestran a los usuarios en una galería con descarga directa.

**Configuración en Google Cloud:**

1. Creá una `Service Account` en Google Cloud Console.
2. Habilitá la `Google Drive API` en el proyecto.
3. En las credenciales de la Service Account, generá una clave JSON. De ese JSON necesitás:
   - `client_email` → va en `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → va en `GOOGLE_DRIVE_PRIVATE_KEY`
4. Creá una carpeta raíz en el Google Drive del otro correo (donde estarán las imágenes).
5. Compartí esa carpeta raíz con el `client_email` de la Service Account, con rol **Editor**.
6. Copiá el ID de la carpeta (está en la URL: `https://drive.google.com/drive/folders/XXXXXX`) y ponelo en `GOOGLE_DRIVE_PARENT_FOLDER_ID`.

**Variables en `backend/.env`:**

```env
GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL=tu-service-account@tu-proyecto.iam.gserviceaccount.com
GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_PARENT_FOLDER_ID=xxxxxxxxxxxxxxxxxxxx
```

> **Importante sobre la private key:** En plataformas como Railway o Render, los saltos de línea se escapan con `\\n`. El servicio los convierte automáticamente a `\n` reales. Si configurás localmente, asegurate de que la variable contenga saltos de línea reales o escapados — el código maneja ambos casos.

**Funcionamiento del módulo:**

| Ruta | Rol | Descripción |
|---|---|---|
| `/admin/advertising` | Admin | Panel CRUD: crear/renombrar/eliminar carpetas, subir/eliminar/ocultar imágenes, ver thumbnails |
| `/advertising` | Admin, User | Galería pública: explorar carpetas, previsualizar imágenes y descargar con un clic |

**Características clave:**

- **Sin carga en el hosting:** Las imágenes se almacenan y sirven directamente desde Google Drive (enlace `webViewLink` y `thumbnailLink`). El frontend solo muestra thumbnails optimizados vía los links de Drive.
- **Descarga directa:** Cada imagen tiene un botón de descarga que usa el enlace `https://drive.google.com/uc?export=download&id=FILE_ID`, permitiendo bajar la imagen en calidad original sin intermediarios.
- **Visibilidad controlada:** El admin puede activar o desactivar imágenes individualmente. Las imágenes ocultas no aparecen en la vista de usuario.
- **Detección automática:** Si subís archivos manualmente al Drive compartido, el módulo los detecta al listar carpetas e imágenes (merge Drive + DB).
- **Persistencia de metadatos:** Los links de Drive, tamaños y estados se guardan en la tabla `advertising_images` de MySQL para evitar consultas redundantes a la API de Google.
- **Limpieza de temporales:** Los archivos subidos vía multer se almacenan en `.tmp-uploads/` y se eliminan automáticamente al terminar la carga a Drive.

**Diseño técnico detallado:** Ver [DESIGN.md](./DESIGN.md).

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
- `scripts/deploy-on-ec2.sh`
- `ecosystem.config.cjs`
- `.github/workflows/security-validation.yml`

Según el entorno, normalmente el flujo es:

1. actualizar el repo
2. instalar dependencias
3. compilar frontend
4. reiniciar procesos del backend

El despliegue audita dependencias, compila el frontend y reinicia el backend Node en PM2. El frontend se sirve como build estatico; las APIs se atienden desde Express bajo `/api`.

## Notas

- El backend expone rutas públicas y privadas bajo `/api`.
- Existen vistas admin para órdenes, renovaciones, inventario, vencimientos, logs de códigos y soporte.
- Hay integración con links compartidos `/s/:token` para mostrar credenciales temporales.
- Las renovaciones generan órdenes `RENO-*` y notifican a Telegram con el bloque básico de la operación.
- En inventario, el campo `ID Venta` solo debe mostrarse cuando la cuenta tiene una suscripción activa asociada; si no existe venta activa, debe quedar vacío.
- El inventario permite abrir una tarjeta responsive por cuenta con credenciales, orden actual, fechas, trazabilidad de reemplazo y línea de tiempo de ventas/reemplazos.
- Desde inventario también se puede abrir soporte sin salir de la página, copiar mensaje/link y ejecutar reemplazos.
- En soporte y en inventario, un reemplazo puede usar la siguiente cuenta disponible o una cuenta específica seleccionada manualmente.
- Los links compartidos de credenciales vencidos se depuran automáticamente al iniciar el backend, cada hora y también al intentar abrir un token expirado.
- Los logs de códigos ya incluyen diagnóstico por motivo para facilitar soporte.
- Netflix tiene tres flujos separados en códigos: código de inicio, aprobación de nueva solicitud de inicio y acceso temporal. Los correos se consideran válidos solo durante 15 minutos; inicio y aprobación se bloquean entre sí por pedido/credencial, y acceso temporal solo permite 1 entrega OK por pedido/credencial. El log queda en `code_deliveries.message` como `OK:code`, `OK:approve` u `OK:temporary`.

## Estado del repo

Rama principal:

```text
main
```

Remoto principal:

```text
https://github.com/StreamingBox/pagv3strbx.git
```
