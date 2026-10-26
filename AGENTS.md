# Instrucciones obligatorias para este repositorio

Antes de cada cambio, vuelve a consultar este archivo, incluso si el cambio es un seguimiento dentro de la misma conversación. Léelo también antes de explorar, probar, respaldar o desplegar. Aplícalo junto con cualquier `AGENTS.md` más específico que exista en los directorios afectados. Si una instrucción no se puede cumplir, detente antes de una acción de riesgo y explica el bloqueo.

## Antes de cada tarea

1. Confirma el repositorio y la rama; revisa `git status --short --branch`, `git log -1 --oneline` y la relación con el upstream. Distingue cambios staged, modificados, eliminados y no rastreados.
2. Inspecciona el código, pruebas y configuración que realmente participan en la tarea. Busca instrucciones locales y cambios previos relacionados. No des por hecho que el contenido local, GitHub y producción son iguales.
3. Conserva todo cambio preexistente del usuario. No uses `git reset --hard`, `git checkout --`, `git clean`, borrados masivos ni reemplazos de carpetas para “limpiar”. No sobrescribas archivos no rastreados sin entender primero qué son.
4. Trata respaldos, capturas, volcados, archivos `.patch`, directorios `.codex-*`, `.build-*`, `.providers-*`, `.tv-*`, secretos y datos operativos como datos del usuario: no los borres, muevas, edites, publiques ni agregues a Git salvo petición explícita y revisión puntual.
5. Para producción, confirma de nuevo el host/IP, dominio, rama y ruta desplegada. El destino de producción definido por el usuario es `2.25.93.122`; no lo sustituyas por `3.144.117.146` ni por otros servidores anteriores.

## Cambios y Git

- Mantén los cambios acotados a lo solicitado y sigue los patrones existentes. Antes de editar, explica brevemente qué vas a tocar.
- Ejecuta verificaciones adecuadas al alcance: pruebas, lint, build, comprobaciones de migración y/o smoke tests. No afirmes que algo pasó si no se ejecutó y observó.
- Antes de un commit, revisa `git diff`, `git diff --cached` y la lista exacta de archivos staged. Busca accidentalmente incluidos secretos, `.env`, claves PEM, credenciales de clientes, bases de datos, respaldos, compilados o archivos diagnósticos.
- Nunca hagas `git add .` ni `git add -A` en un workspace con archivos no rastreados sin revisar cada elemento. Agrega únicamente rutas del cambio solicitado.
- Si el usuario pide que el cambio quede en Git o en GitHub, confirma rama y remoto; revisa el diff staged, crea un commit descriptivo y sube solo esa rama. Verifica el resultado con `git status` y el SHA remoto. Un push no significa que producción esté desplegada.
- Preferencia permanente explícita del usuario: cuando solicite un cambio, evalúalo y, si la revisión, pruebas y preflight de producción pasan, crea el commit, súbelo a `origin/main` y despliega a producción sin pedir confirmación adicional. Si alguna validación o condición de seguridad falla, conserva los cambios y detente antes de la operación riesgosa; explica el bloqueo sin eludir controles.
- No reviertas ni “restaures” cambios del usuario para hacer coincidir el árbol con GitHub. Si las diferencias impiden continuar, conserva la evidencia y pide una decisión antes de sobrescribir.

## Producción y despliegues

- Un despliegue es una operación separada del commit y del push. No digas que está publicado hasta verificarlo en el servidor y en la URL real.
- Antes de desplegar, verifica el destino SSH y su identidad, el commit exacto, estado del checkout, diferencias locales/remotas, script de despliegue, directorio servido por Nginx, configuración de servicios, espacio disponible y salud de API/worker. No despliegues sobre un checkout sucio o divergente sin entender y resolver las diferencias de forma no destructiva.
- Comprueba que exista un respaldo recuperable y que su contenido se pueda leer antes de una operación que pueda afectar datos. Nunca borres histórico de Google Drive: el histórico debe conservarse. No elimines respaldos o releases antiguos sin autorización explícita.
- Usa únicamente procedimientos de despliegue revisados que preserven datos y permitan recuperación. No ejecutes `reset --hard`, `clean`, borrados de base de datos, reemplazos recursivos ni migraciones destructivas como atajo.
- Después del despliegue, verifica commit/release activo, endpoints, recursos estáticos y las pantallas afectadas con pruebas funcionales. Si no se pudo verificar, dilo claramente y no presentes el cambio como completado en producción.
- No renombres ni parches aisladamente el JavaScript compilado: sus módulos comparten imports, React y Router. Publica una compilación completa y ejecuta `frontend/scripts/verify-release.mjs`, que debe comprobar un único arranque de la aplicación y todas las dependencias importadas.
- Comprueba Admin, Códigos y Soporte en un navegador, además de HTTP: ninguna vista de error, ningún error de Router y una sola entrada de la aplicación. Para las pruebas usa datos ficticios y nunca imprimas credenciales.
- La referencia de código operativo es `origin/main`. Antes de actualizar un checkout antiguo conserva sus fuentes y estado de Git; usa el plan revisable de `ops/ec2/reconcile-checkout.mjs` y su respaldo, sin borrar datos ni ocultar diferencias de código.

## Funciones sensibles del producto

- Al tocar inventario, compras, proveedores, renovaciones, pagos, códigos de acceso/OTP o respaldos, primero traza el flujo completo entre frontend, API, base de datos, workers y despliegue. Revisa la compatibilidad con datos existentes y los permisos por rol.
- Mantén la lógica de YouTube, el nombre del canal, la consulta de códigos, los límites y ventanas por pedido, y los estados del inventario coherentes entre alta manual, Excel, edición, venta y consulta. Añade o actualiza pruebas para las rutas afectadas.
- Trata semillas TOTP, códigos de un solo uso, contraseñas, datos de clientes y credenciales AWS como secretos. No los imprimas en logs, capturas, commits, respuestas ni archivos de ejemplo reales. Usa variables de entorno y datos de prueba ficticios.
- Para respaldos, verifica por separado creación, integridad, subida a Drive, notificación y recuperación. Una carpeta visible o una notificación enviada no demuestra por sí sola que el respaldo sea válido.
- Toda copia real, diaria o extraordinaria, manual, previa a un cambio, de fuentes, base de datos o limpieza, debe quedar en Google Drive. Usa `backend/scripts/upload-backup-drive.js` para las copias fuera del flujo diario. No declares éxito ni retires originales hasta observar la verificación remota. Si Drive falla, conserva la copia local, registra el pendiente y detén la operación que dependía de ese respaldo. Las pruebas con datos ficticios usan transporte simulado.
- Conserva todo el histórico de Drive. No uses sincronizaciones con borrado, no reemplaces copias verificadas y no desactives la subida mediante flags locales. Comprueba también las copias pendientes de `sync-backup-drive.js` antes de cerrar trabajos de respaldo.

## Cierre obligatorio de cada tarea

Antes de responder, vuelve a revisar el diff y `git status`. Resume qué cambió, qué pruebas se ejecutaron y sus resultados, y el estado real de GitHub y producción por separado. Identifica explícitamente todo paso que no se ejecutó o no se pudo verificar. No prometas que un fallo no volverá a ocurrir; explica qué controles concretos se añadieron y qué riesgo residual queda.
