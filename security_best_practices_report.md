# Reporte de auditoria de seguridad - pageV3

> Actualizacion 2026-07-10: el backend incorpora modo SQL estricto por sesion en produccion, idempotencia de checkout, reserva atomica de codigos, cola transaccional de notificaciones, readiness real contra base de datos y migracion de comprobantes publicos a almacenamiento privado. La migracion `024_integrity_idempotency_outbox` deja en revision los estados ambiguos y registra conflictos de asignacion activos para tratamiento administrativo.

> Pendiente externo: la migracion de secretos a AWS SSM/Secrets Manager necesita IAM y provisionamiento en la cuenta AWS; no se simula con valores en el repositorio.

Fecha de revision: 2026-04-25

## Resumen ejecutivo

> Estado actualizado el 2026-06-23: los hallazgos de contrasena en `localStorage`, migracion de `xlsx` a `@e965/xlsx` y COOP ya no deben tratarse como abiertos en el estado actual del codigo. COOP esta aplicado como `same-origin-allow-popups`; COEP sigue como evaluacion de compatibilidad.

La revision cubrio codigo propio versionado del monorepo: backend Express, frontend React/Vite, servicios Go heredados, Android/Capacitor, scripts y configuracion. Se excluyeron `node_modules`, caches y build outputs como fuente primaria, pero se ejecuto `npm audit` contra los lockfiles actuales.

El riesgo remanente esta concentrado en estos frentes:

1. La contrasena en `localStorage` fue corregida en codigo; queda como riesgo historico para usuarios que hayan usado builds anteriores y deban rotar contrasena si aplica.
2. Los servicios Go heredados fueron retirados del repo y del despliegue el 2026-06-24. La ruta de codigos y checkout productivo queda atendida por el backend Node.
3. Las vulnerabilidades altas de dependencias quedaron cerradas al nivel `npm audit --audit-level=high`; frontend conserva un aviso bajo de tooling (`esbuild`) que no bloquea produccion si el dev server no se expone.

Tambien hay riesgos altos/medios alrededor de enlaces de reset construidos desde headers controlables, carga publica de SVG, fallback IMAP que desactiva verificacion TLS, falta de timeouts/error handlers explicitos en Express y configuracion Android con backup permitido.

## Criticos

### SBX-001 - Contrasena del usuario guardada en `localStorage` (resuelto en codigo)

- Severidad original: Critica
- Estado actual: Resuelto en codigo el 2026-06-23; queda pendiente solo la consideracion operativa de rotar contrasenas si hubo builds anteriores en uso.
- Ubicacion:
  - `frontend/src/pages/Auth.jsx:14`
  - `frontend/src/pages/Auth.jsx:16`
  - `frontend/src/pages/Auth.jsx:82`
  - `frontend/src/pages/Auth.jsx:90`
  - `frontend/src/pages/Auth.jsx:114`
  - `frontend/src/pages/Auth.jsx:120`
  - `frontend/src/pages/Auth.jsx:139`
- Evidencia actual:
  - El login ya no persiste la contrasena del usuario.
  - La app conserva el correo cuando aplica y limpia la clave legacy `sb-app-saved-password`.
- Riesgo operativo restante:
  - Usuarios que usaron builds anteriores pudieron quedar expuestos si un dispositivo ya estaba comprometido; evaluar rotacion de contrasenas para esos casos.

### SBX-002 - Servicios Go con operaciones de negocio sin autenticacion visible (retirado)

- Severidad original: Critica si estaban expuestos fuera de `localhost`; Alta si solo se ejecutaban en red interna controlada.
- Estado actual: Retirado el 2026-06-24.
- Evidencia actual:
  - El directorio `go-backend/` fue eliminado del repo.
  - `deploy.sh`, `ecosystem.config.cjs` y `.github/workflows/security-validation.yml` ya no compilan, arrancan ni prueban servicios Go.
  - Produccion atiende codigos con `backend/src/routes/codes.js` y checkout con el backend Node.
- Riesgo operativo restante:
  - Verificar que no queden procesos externos antiguos en servidores no administrados por este repo. En la EC2 actual no habia procesos Go corriendo.

## Altos

### SBX-003 - Dependencias vulnerables en backend, frontend y raiz (altas resueltas)

- Severidad original: Alta; incluia avisos criticos en backend
- Estado actual: Resuelto para nivel alto. Raiz, backend y frontend pasan `npm audit --audit-level=high`; frontend conserva solo un aviso bajo de tooling (`esbuild`).
- Ubicacion:
  - `backend/package.json:16`
  - `backend/package.json:23`
  - `backend/package.json:25`
  - `backend/package.json:28`
  - `backend/package.json:30`
  - `backend/package.json:31`
  - `frontend/package.json:16`
  - `frontend/package.json:23`
  - `frontend/package.json:37`
  - `package.json:12`
- Evidencia actual:
  - `npm audit --audit-level=high` en raiz: OK.
  - `npm audit --audit-level=high` en `backend`: OK.
  - `npm audit --audit-level=high` en `frontend`: OK; queda un aviso bajo en `esbuild`.
  - El frontend usa `@e965/xlsx` en lugar del paquete `xlsx` anterior.
  - `BalancedText` ya no depende de `@chenglou/pretext`.
- Impacto:
  - Backend: potencial bypass de rate limit, DoS de upload, SSRF/header issues por clientes HTTP, vulnerabilidades en parseo IMAP/mail y librerias transitivas obsoletas.
  - Frontend/build: riesgo de DoS/prototype pollution al procesar XLSX o texto no confiable; riesgo de lectura/escritura de archivos si el dev server Vite vulnerable queda expuesto.
- Fix recomendado:
  - Ejecutar actualizaciones dirigidas y revisar cambios de lockfile:
    - Backend: actualizar `express-rate-limit`, `multer`, `axios`, `nodemailer`/`mailparser`.
    - Evaluar reemplazo de `imap-simple` por una libreria mantenida o fijar version sin advisories tras pruebas.
    - Evaluar reemplazo de `node-telegram-bot-api` si mantiene `request` vulnerable.
    - Frontend: mantener Vite/esbuild actualizado y no exponer el dev server a internet.
  - Mantener `npm audit --audit-level=high` en CI para raiz, backend y frontend.
- Mitigacion temporal:
  - Aislar procesos de build/dev del exterior.
  - No aceptar XLSX arbitrarios de usuarios no confiables hasta actualizar o aislar el parser.
- Notas de falso positivo:
  - Algunos avisos son transitorios o de tooling; se deben priorizar runtime del backend y cualquier parser que procese input de usuarios.

### SBX-004 - Enlaces de recuperacion de contrasena pueden usar `Origin`/`Host` controlables

- Severidad: Alta
- Ubicacion:
  - `backend/src/routes/auth.js:62`
  - `backend/src/routes/auth.js:69`
  - `backend/src/routes/auth.js:72`
  - `backend/src/routes/auth.js:73`
  - `backend/src/routes/auth.js:176`
- Evidencia:
  - `getFrontendBaseUrl(req)` usa `FRONTEND_URL`/`APP_URL`/`CLIENT_URL` si existen.
  - Si faltan, cae a `req.headers.origin`.
  - Si no hay origin, usa `x-forwarded-proto`, `x-forwarded-host` o `Host`.
  - El enlace de reset se construye con ese valor.
- Impacto:
  - Si la configuracion de entorno falta o el proxy permite headers no confiables, un atacante puede provocar emails con enlaces hacia un dominio bajo su control.
  - Esto facilita phishing y robo del token de reset si el usuario hace clic.
- Fix recomendado:
  - Requerir `FRONTEND_URL` en produccion y abortar arranque si falta.
  - Validar que el base URL pertenezca a una allowlist exacta (`https://strbx.com.co`, `https://www.strbx.com.co`).
  - No construir enlaces sensibles desde `Origin`, `Host` o `X-Forwarded-*`.
- Mitigacion temporal:
  - Definir `FRONTEND_URL=https://strbx.com.co` en produccion.
  - En Nginx, sobrescribir `Host`/`X-Forwarded-*` y no reenviar valores de cliente sin control.
- Notas de falso positivo:
  - Si `FRONTEND_URL` siempre esta configurado en produccion, el exploit directo queda mitigado. Aun asi conviene hacer el fallo seguro en codigo.

### SBX-005 - Backup Android habilitado amplifica exposicion de datos locales

- Severidad: Alta por combinacion con SBX-001; Media por si sola
- Ubicacion:
  - `frontend/android/app/src/main/AndroidManifest.xml:4`
  - `frontend/android/app/src/main/AndroidManifest.xml:5`
- Evidencia:
  - La aplicacion declara `android:allowBackup="true"`.
  - La app guarda datos sensibles de sesion/preferencias en almacenamiento local del WebView.
- Impacto:
  - Backups del dispositivo pueden incluir datos de la app, incluyendo credenciales guardadas por la vulnerabilidad SBX-001.
- Fix recomendado:
  - Cambiar a `android:allowBackup="false"` para builds de produccion, o definir reglas de backup que excluyan almacenamiento WebView/local sensible.
  - Eliminar el guardado de contrasenas en frontend.
- Mitigacion temporal:
  - Publicar una build que limpie claves `sb-app-saved-*` y desactive backup.
- Notas de falso positivo:
  - Si el sistema operativo o politica MDM bloquea backups, el riesgo baja, pero la app no debe depender de eso.

### SBX-006 - Upload/serving de SVG publico sin sanitizacion

- Severidad: Alta si administradores no son completamente confiables o si una cuenta admin se compromete; Media si admin es unico y confiable
- Ubicacion:
  - `backend/src/routes/admin.branding.js:17`
  - `backend/src/routes/admin.branding.js:24`
  - `backend/src/routes/admin.branding.js:46`
  - `backend/src/routes/branding.js:6`
  - `backend/src/routes/branding.js:14`
- Evidencia:
  - El endpoint admin acepta `image/svg+xml` en `dataUrl`.
  - Guarda el MIME y bytes en BD.
  - El endpoint publico `/branding/logo` responde con `Content-Type` tomado de la BD.
- Impacto:
  - Un SVG malicioso puede contener JavaScript, links externos, tracking o payloads que se ejecuten cuando se navega directamente al recurso o se use en ciertos contextos.
  - Si una cuenta admin cae, el atacante podria persistir contenido activo servido desde el mismo origen.
- Fix recomendado:
  - No aceptar SVG para logos subidos; permitir solo PNG/JPEG/WEBP.
  - Validar magic bytes del archivo, no solo MIME declarado.
  - Si SVG es obligatorio, sanitizar con una libreria robusta y servir con `Content-Disposition: attachment` o dominio separado sin cookies.
- Mitigacion temporal:
  - Remover SVG de la lista `allowed`.
  - Agregar `X-Content-Type-Options: nosniff` y CSP estricta para recursos HTML/SVG.
- Notas de falso positivo:
  - Renderizar SVG dentro de `<img>` reduce riesgo de script, pero el recurso tambien es publico y navegable.

### SBX-007 - Fallback IMAP desactiva verificacion TLS automaticamente

- Severidad: Alta
- Ubicacion:
  - `backend/src/utils/imapConfig.js:31`
  - `backend/src/utils/imapConfig.js:33`
  - `backend/src/utils/imapConfig.js:52`
  - `backend/src/utils/imapConfig.js:60`
  - `backend/src/utils/imapConfig.js:66`
  - `backend/src/utils/imapConfig.js:71`
- Evidencia:
  - La configuracion base permite `IMAP_TLS_INSECURE`.
  - `connectImapWithTlsFallback` reintenta automaticamente con `rejectUnauthorized: false` ante errores de certificado.
- Impacto:
  - Un atacante en red o proxy con certificado invalido podria interceptar credenciales IMAP y codigos de acceso, especialmente porque Gmail/IMAP maneja datos sensibles.
- Fix recomendado:
  - En produccion, nunca reintentar con `rejectUnauthorized: false`.
  - Limitar el fallback a `NODE_ENV !== "production"` y solo cuando `IMAP_TLS_INSECURE=true`.
  - Registrar error claro y fallar cerrado en produccion.
- Mitigacion temporal:
  - Verificar que `IMAP_TLS_INSECURE` no este definido en produccion.
  - Monitorear logs por el warning de fallback TLS.
- Notas de falso positivo:
  - Si nunca ocurre un error de certificado, no se activa el fallback, pero el codigo mantiene una ruta insegura para produccion.

## Medios

### SBX-008 - Express sin timeouts HTTP ni manejadores finales explicitos

- Severidad: Media
- Ubicacion:
  - `backend/src/index.js:278`
  - `backend/src/index.js:279`
  - `backend/src/index.js:280`
- Evidencia:
  - El servidor se crea con `app.listen(port, ...)` y no se configuran `requestTimeout`, `headersTimeout`, `keepAliveTimeout` ni `maxHeadersCount`.
  - No se observa un 404 handler ni error handler central despues de montar rutas.
- Impacto:
  - Mayor exposicion a conexiones lentas, header abuse y comportamiento inconsistente de errores.
  - Errores no controlados pueden depender del handler por defecto de Express.
- Fix recomendado:
  - Crear `http.createServer(app)` y configurar timeouts explicitos.
  - Agregar 404 handler JSON y error handler central que no filtre stack traces en produccion.
- Mitigacion temporal:
  - Configurar timeouts equivalentes en Nginx y PM2.
- Notas de falso positivo:
  - Un reverse proxy puede mitigar parte del riesgo, pero no esta documentado como control completo.

### SBX-009 - Body parser amplio y `urlencoded` sin `parameterLimit`/`depth`

- Severidad: Media
- Ubicacion:
  - `backend/src/index.js:199`
  - `backend/src/index.js:205`
- Evidencia:
  - `express.json({ limit: "5mb" })` aplica globalmente.
  - `express.urlencoded({ extended: true, limit: "5mb" })` no fija `parameterLimit` ni profundidad.
- Impacto:
  - Carga innecesaria para rutas que no requieren 5 MB.
  - Mayor riesgo de DoS por estructuras profundas o muchos parametros si el parser acepta payloads complejos.
- Fix recomendado:
  - Reducir limite global a algo menor, por ejemplo `256kb`, y usar parsers especificos para uploads/webhooks.
  - Configurar `parameterLimit` y `depth` para `urlencoded`.
- Mitigacion temporal:
  - Mantener `client_max_body_size` bajo en Nginx y limites de `multer`.
- Notas de falso positivo:
  - El middleware `sanitize` bloquea algunas claves peligrosas, pero corre despues de parsear el body.

### SBX-010 - Debug endpoints publicos

- Severidad: Media/Baja
- Ubicacion:
  - `backend/src/routes/catalog.js:93`
  - `backend/src/routes/catalog.js:95`
  - `backend/src/routes/catalog.js:120`
  - `backend/src/routes/codes.js:80`
- Evidencia:
  - `/debug-catalog` no usa `requireAuth`.
  - Devuelve datos de catalogo/precios/stock.
  - `/codes/test-v3` es publico.
- Impacto:
  - Exposicion innecesaria de datos operativos y superficie de enumeracion.
- Fix recomendado:
  - Remover endpoints debug de produccion o protegerlos con `requireAuth` + `requireRole("admin")` + flag `NODE_ENV !== "production"`.
- Mitigacion temporal:
  - Bloquear rutas debug en Nginx.
- Notas de falso positivo:
  - El endpoint devuelve pocos registros (`LIMIT 5`), pero no hay razon para que sea publico.

### SBX-011 - Secretos y scripts auxiliares inseguros en repositorio

- Severidad: Media
- Ubicacion:
  - `backend/scripts/hash.js:4`
  - `backend/scripts/hash.js:9`
  - `backend/scripts/test-login.js:4`
  - `backend/scripts/test-login.js:5`
- Evidencia:
  - Hay un script que contiene una contrasena literal y la imprime junto con su hash.
  - Hay scripts de test con credenciales de ejemplo.
- Impacto:
  - Si el valor fue usado alguna vez en produccion o compartido, debe tratarse como comprometido.
  - Fomenta practicas de copiar contrasenas reales a scripts.
- Fix recomendado:
  - Reemplazar literales por argumentos CLI o variables de entorno.
  - No imprimir contrasenas; imprimir solo hash.
  - Rotar cualquier credencial real que coincida con valores versionados.
- Mitigacion temporal:
  - Documentar que son valores ficticios y eliminar logs de contrasenas.
- Notas de falso positivo:
  - No se debe publicar el valor exacto en reportes o logs; se cita solo la ubicacion.

### SBX-012 - Auto-migraciones en arranque de backend

- Severidad: Media
- Ubicacion:
  - `backend/src/db.js:21`
  - `backend/src/db.js:22`
  - `backend/src/db.js:27`
  - `backend/src/db.js:117`
  - `backend/src/db.js:244`
  - `backend/src/db.js:300`
- Evidencia:
  - El modulo de DB ejecuta multiples `ALTER TABLE`, `CREATE TABLE` e indices al importarse.
  - Muchos errores se silencian con `.catch(() => {})`.
- Impacto:
  - Arranques de produccion pueden cambiar schema sin ventana de mantenimiento.
  - Errores reales de migracion quedan ocultos, dejando schema parcialmente actualizado.
  - Las migraciones concurrentes pueden degradar disponibilidad.
- Fix recomendado:
  - Mover DDL a migraciones versionadas y ejecutarlas explicitamente antes del deploy.
  - Loguear/fallar ante errores inesperados de migracion.
- Mitigacion temporal:
  - Mantener backups y ejecutar deploys con una sola instancia.
- Notas de falso positivo:
  - Algunas migraciones son no destructivas, pero el patron sigue siendo riesgoso para operacion.

### SBX-013 - CSRF depende casi totalmente de `SameSite=Strict`

- Severidad: Media
- Ubicacion:
  - `backend/src/routes/auth.js:22`
  - `backend/src/routes/auth.js:25`
  - `backend/src/index.js:112`
  - `backend/src/index.js:118`
- Evidencia:
  - La app usa cookies `HttpOnly`, `Secure` en produccion y `SameSite: "strict"`.
  - CORS permite credenciales para allowlist.
  - No se observa token CSRF explicito para POST/PATCH/DELETE.
- Impacto:
  - Con `SameSite=Strict`, el riesgo CSRF clasico baja bastante.
  - Si en el futuro se cambia a `SameSite=None` para integraciones, subdominios o WebView, endpoints de cambio de estado quedarian sin defensa CSRF dedicada.
- Fix recomendado:
  - Documentar que `SameSite=Strict` es un requisito de seguridad.
  - Agregar token CSRF para rutas cookie-auth si se requiere cross-site o SameSite mas permisivo.
- Mitigacion temporal:
  - No ampliar CORS ni cambiar `sameSite` sin incluir CSRF token.
- Notas de falso positivo:
  - No se marca como critica porque la configuracion actual usa `Strict`.

## Bajos / Higiene

### SBX-014 - HSTS preload configurado desde app sin evidencia de politica completa

- Severidad: Baja/Operacional
- Ubicacion:
  - `backend/src/index.js:145`
  - `backend/src/index.js:147`
  - `backend/src/index.js:148`
- Evidencia:
  - Helmet configura `hsts` con `includeSubDomains: true` y `preload: true`.
- Impacto:
  - Si algun subdominio no soporta HTTPS correctamente, `includeSubDomains`/preload puede causar bloqueo persistente para usuarios.
- Fix recomendado:
  - Confirmar que todos los subdominios estan listos para HTTPS antes de preload.
  - Considerar mover HSTS al edge/Nginx con una decision operacional documentada.
- Mitigacion temporal:
  - Mantener HSTS sin preload hasta verificar dominio completo.
- Notas de falso positivo:
  - HSTS es una proteccion valida; el riesgo aqui es de despliegue/operacion.

### SBX-015 - Artefactos binarios versionados

- Severidad: Baja/Higiene
- Estado actual: Corregido en el indice Git.
- Evidencia actual:
  - La APK publica y los binarios Go heredados fueron retirados del control de versiones.
  - `.gitignore` ignora `*.apk` y `*.exe~`.
- Impacto:
  - Dificulta revision de cambios, trazabilidad y escaneo.
  - Puede distribuir builds antiguos o no reproducibles.
- Fix recomendado:
  - Publicar artefactos desde CI/releases y mantener checksums firmados.
  - Evitar binarios en el repositorio salvo que haya politica explicita.
- Mitigacion temporal:
  - Documentar version, commit origen y hash SHA-256 de cada artefacto.

## Mejoras recomendadas adicionales

1. Validacion de configuracion al arranque:
   - Fallar en produccion si faltan `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URL`, `PUBLIC_BASE_URL`, `DB_*` o secretos de webhooks requeridos.
   - Validar longitud minima de secretos JWT.

2. Seguridad de uploads:
   - Validar magic bytes.
   - Normalizar/limitar dimensiones de imagen si aplica.
   - Servir archivos subidos desde un origen sin cookies cuando sea posible.

3. Headers en frontend/Nginx:
   - Agregar headers para SPA: `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` y framing.
   - Validar con `curl -I` contra dominio real.

5. Observabilidad:
   - Evitar logs con credenciales, codigos o tokens.
   - Agregar alertas para intentos de reset, rate limit, webhooks invalidos y fallos TLS.

## Validacion original ejecutada (historica)

- `git ls-files`: usado para limitar la revision a archivos versionados.
- `npm audit --json` en `backend`: fallo por vulnerabilidades reportadas; 25 totales, incluyendo 2 criticas y 11 altas. Estado historico; ver actualizacion 2026-06-23.
- `npm audit --json` en `frontend`: fallo por vulnerabilidades reportadas; 11 totales, 8 altas. Estado historico; ver actualizacion 2026-06-23.
- `npm audit --json` en raiz: fallo por 1 vulnerabilidad alta. Estado historico; ver actualizacion 2026-06-23.
- Go: validacion historica no aplica al estado actual; los servicios Go heredados fueron retirados el 2026-06-24.

## Prioridad de remediacion sugerida

1. Mantener eliminado el almacenamiento de contrasenas en Android/WebView y publicar/renovar builds cuando aplique.
2. Verificar que no queden procesos Go antiguos fuera del repo en servidores no administrados.
3. Fijar `FRONTEND_URL`/`PUBLIC_BASE_URL` y remover fallback a headers para enlaces sensibles.
4. Mantener actualizaciones de dependencias y el bloqueo de `npm audit --audit-level=high`.
5. Desactivar backup Android o excluir almacenamiento sensible.
6. Bloquear SVG y endurecer validacion de uploads.
7. Quitar fallback TLS inseguro para IMAP en produccion.
8. Agregar timeouts/error handlers y mover migraciones fuera del arranque.
9. Proteger o eliminar endpoints debug.
10. Mantener `npm audit` en CI para raiz, backend y frontend.

## Estado de validacion posterior

Validacion realizada el 2026-04-25 despues de revisar el arbol de trabajo actual.

### Cambios ya presentes en el working tree

- SBX-001: corregido en codigo. `frontend/src/pages/Auth.jsx` ya no guarda la contrasena; limpia `sb-app-saved-password` y cambia el texto a "Guardar correo en esta app". Sigue pendiente considerar rotacion de contrasenas de usuarios que usaron builds anteriores.
- SBX-004: parcialmente corregido. `backend/src/routes/auth.js` ahora exige `FRONTEND_URL` en produccion y valida URL de entorno. En desarrollo aun permite fallback a `Origin`/`Host`, lo cual es aceptable solo fuera de produccion.
- SBX-005: corregido en codigo fuente. `frontend/android/app/src/main/AndroidManifest.xml` tiene `android:allowBackup="false"`. Falta compilar/publicar APK nueva.
- SBX-006: parcialmente corregido. `backend/src/routes/admin.branding.js` ya no permite SVG y valida firma de PNG/JPEG/WEBP; `backend/src/routes/admin.upload.js` valida MIME/firma. Falta probar uploads reales y decidir si convertir todo a PNG o conservar extension/MIME real.
- SBX-008/SBX-009: parcialmente corregidos. `backend/src/index.js` agrega validacion de configuracion, timeouts HTTP, 404/error handler y `parameterLimit`/`depth` en urlencoded. Falta smoke test con servidor real y revisar limites por ruta.
- SBX-010: parcialmente corregido. Hay cambios en `catalog.js`/`codes.js`; validar en revision final que endpoints debug quedaron protegidos o fuera de produccion.

### Validacion ejecutada ahora

- `node --check` sobre los archivos backend modificados: OK.
- `npm run build` en `frontend`: OK.
- `npm audit --audit-level=high` en `backend`: OK en la validacion actual 2026-06-23.
- `npm audit --audit-level=high` en `frontend`: OK en la validacion actual 2026-06-23; queda solo aviso bajo de tooling (`esbuild`).
- `npm run lint` en `frontend`: no concluyo; timeout despues de ~124 segundos.

### Pendiente antes de considerar la remediacion cerrada

1. Mantener dependencias backend y frontend actualizadas; `xlsx` y `@chenglou/pretext` ya no son hallazgos abiertos.
2. Servicios Go heredados: retirados del repo y del despliegue el 2026-06-24.
3. Corregir IMAP TLS fallback: `connectImapWithTlsFallback` sigue reintentando con `rejectUnauthorized=false`; debe fallar cerrado en produccion.
4. Ejecutar smoke test del backend levantando servidor con variables reales de staging o entorno local completo.
5. Probar manualmente flujos sensibles: login, refresh, logout, forgot/reset password, checkout, upload logo, branding logo y links `/s/:token`.
6. Publicar una APK nueva para que `allowBackup=false` y la limpieza de contrasena lleguen a usuarios.
7. Revisar si los cambios actuales deben documentarse como fixes en el reporte principal o separarse en una rama/commit de remediacion.

## Estado final de remediacion aplicada

Validacion realizada el 2026-04-25 despues de aplicar los fixes faltantes.

### Cambios aplicados

- Dependencias:
  - Backend: reemplazado el uso directo de `node-telegram-bot-api` por cliente Telegram propio con `axios`; se elimino el arbol vulnerable `request`.
  - Backend: `npm audit --audit-level=high` queda en 0 vulnerabilidades altas o criticas.
  - Frontend: reemplazados `xlsx` y `@chenglou/pretext`; `loadXlsx` ahora usa `@e965/xlsx` y `BalancedText` usa balanceo local.
  - Frontend: `npm audit --audit-level=high` queda en 0 vulnerabilidades altas o criticas; queda un aviso bajo de tooling (`esbuild`).
  - Raiz: `npm audit --audit-level=high` queda en 0 vulnerabilidades altas o criticas.
- Go:
  - Estado historico: primero se endurecieron los servicios heredados.
  - Estado actual 2026-06-24: los servicios Go fueron retirados del repo, despliegue y CI porque la produccion actual usa backend Node.
- TLS:
  - `IMAP_TLS_INSECURE` y `NETFLIX_TLS_INSECURE` ya no habilitan TLS inseguro en produccion.
  - El fallback IMAP a `rejectUnauthorized=false` solo queda permitido fuera de produccion y si se habilita explicitamente.
- Higiene de validacion:
  - ESLint ya ignora salidas generadas de Gradle/Capacitor (`android/.gradle-*`, builds y assets publicos generados).
  - `.gitignore` del frontend ahora excluye esas salidas generadas.

### Validacion final ejecutada

- `node --check` en backend modificado: OK.
- Smoke test backend (`require('./src/index.js')` y salida a los 3s): OK, servidor arranco en `:3000`.
- `npm audit --audit-level=high` en raiz: OK, 0 vulnerabilidades altas o criticas.
- `npm audit --audit-level=high` en `backend`: OK, 0 vulnerabilidades altas o criticas.
- `npm audit --audit-level=high` en `frontend`: OK, 0 vulnerabilidades altas o criticas; queda un aviso bajo de tooling (`esbuild`).
- `npm run build` en `frontend`: OK.
- Servicios Go: no aplican en el estado actual porque fueron retirados del repo.

### Pendientes reales

1. Publicar APK nueva para distribuir `allowBackup=false` y la eliminacion del guardado de contrasena.
2. Ejecutar pruebas manuales con servicios reales: login, refresh, logout, forgot/reset password, checkout, uploads, branding, Telegram polling y flujo IMAP.
3. Revisar y limpiar deuda de `npm run lint`: el lint completo aun falla por deuda existente en `src` (imports no usados, `catch {}` vacios, reglas nuevas de hooks y `vite.config.js` sin globals Node). No bloquea build ni audits, pero debe corregirse en una tarea separada.
4. Quitar o formalizar artefactos binarios versionados (`.apk`, `.exe`, backups) mediante releases/checksums.
5. Validar headers reales con `curl -I` contra staging/produccion, porque parte de la postura HTTP depende de Nginx/edge.

## Cierre operativo adicional

Validacion realizada el 2026-04-25 para cerrar los pendientes fuera de codigo que eran ejecutables desde este entorno.

### Acciones completadas

- APK Android:
  - Ejecutado `npm run android:sync`.
  - Ejecutado `gradlew assembleRelease` con `GRADLE_USER_HOME` local.
  - Reemplazado `frontend/public/downloads/streaming-box-android.apk` con `app-release.apk`.
  - APK publica nueva: `27194164` bytes.
  - SHA-256: `A16D61070CC632139A30BF75217F6A33487F25810DFE62113948A1196A69DBA9`.
  - `apksigner verify --verbose`: OK, firma v2 valida, 1 firmante.
- CI/despliegue:
  - Agregado `.github/workflows/security-validation.yml` con Node 20, audits, backend check/test, frontend lint/test/build.
  - `deploy.sh` audita dependencias, compila frontend y reinicia el backend Node en PM2.
  - `ecosystem.config.cjs` queda limitado a procesos Node/Frontend; los servicios Go fueron retirados.
- Binarios versionados:
  - La APK y binarios Go versionados fueron retirados del indice Git.
  - `.gitignore` ahora ignora `*.apk` y `*.exe~`.
- Headers:
  - `curl -I -L https://strbx.com.co`: el frontend responde 200, pero no envia headers de seguridad.
  - `curl -I -L https://www.strbx.com.co`: mismo resultado.
  - `curl -I -L https://strbx.com.co/api/health`: API responde con Helmet/CSP/HSTS.
  - Agregada plantilla `deploy/nginx/streaming-box.conf` con HSTS, CSP, Referrer-Policy, Permissions-Policy y headers anti-sniffing/framing.
  - `deploy.sh` puede instalar esa plantilla si se define `NGINX_SITE_PATH`.
- Proveedores externos:
  - Telegram `getMe`: OK, bot respondio.
  - IMAP: intento real fallo con `DEPTH_ZERO_SELF_SIGNED_CERT`; con la postura nueva esto queda fail-closed y no se fuerza TLS inseguro.

### Validacion ejecutada despues del cierre

- `npm run build` en frontend: OK.
- `npm audit --audit-level=high` raiz/backend/frontend: OK, 0 vulnerabilidades altas o criticas; frontend conserva un aviso bajo de tooling (`esbuild`).
- `node --check ecosystem.config.cjs`: OK.
- `bash -n deploy.sh` con Git Bash: OK.
- Go: no aplica en el estado actual porque `go-backend/` fue retirado.

### Pendiente externo no ejecutable desde este entorno

- Aplicar la plantilla Nginx en el VPS real y recargar Nginx.
- Resolver el certificado TLS interceptado/incorrecto que afecta IMAP antes de usarlo en produccion.
- Hacer el despliegue efectivo en el VPS si no existe automatizacion que consuma el push de GitHub.
