# Todas las copias deben quedar en Drive

La regla incluye respaldos diarios, manuales, fuentes previas a despliegues,
bases de datos, releases y archivos recuperados por `/limpiar_servidor`.

## Creacion y verificacion

El flujo diario existente transmite la base de datos y los archivos a Drive y
verifica sus hashes. El modo local sin Drive esta deshabilitado.

Las demas copias usan:

```sh
node backend/scripts/upload-backup-drive.js /ruta/privada/de/la/copia manual
```

La herramienta crea un tar por streaming hacia el remoto `gdrive` ya configurado.
No crea un tar adicional en RAM ni disco. Lee de vuelta la copia remota y exige
el mismo SHA-256 y numero de bytes antes de emitir un recibo verificado.

Los destinos incluyen UUID y nunca reemplazan una copia anterior. Solo se usan
operaciones de subida y lectura; no hay sincronizacion con borrado ni purga de
Drive. La copia local se conserva.

`~ubuntu/.strbx-drive-receipts/` guarda solicitudes pendientes y recibos privados
con origen, destino, fecha y SHA-256. Estos metadatos no van a Git. Una copia sin
recibo verificado sigue pendiente. Una notificacion no sustituye la verificacion.

El alineador de fuentes exige Drive antes de actualizar el checkout y comprueba
de nuevo que las fuentes no cambiaron durante la subida. La limpieza de Telegram
exige Drive antes de retirar cualquier temporal de RAM.

## Reintentos e historico

`streaming-box-backup-drive-sync.timer` ejecuta una pasada cada 15 minutos. La
pasada reintenta pendientes y descubre copias antiguas en los directorios de
historial de fuentes, limpieza, respaldos operativos y releases de frontend.
No borra ni mueve esas copias locales. Los fallos conservan el pendiente y avisan
por Telegram cuando cambia su cantidad.

## Recuperacion

Descargar el objeto indicado en el recibo, comprobar SHA-256 y listar su tar.
Extraer solo a un directorio privado nuevo; no sobre una base de datos, un
checkout o un release activo. Para respaldos de bases de datos, comprobar tambien
el gzip y realizar la restauracion en una base de prueba antes de usarla.
