# Limpieza de temporales desde Telegram

`/limpiar_servidor` y el boton `Liberar recursos` de `/start` estan disponibles
solo para un administrador de `TELEGRAM_CHAT_IDS`, en su chat privado y con el
mismo ID de remitente y chat. No ejecutan argumentos ni comandos del usuario.

El bot muestra RAM, swap y disco antes y despues. `/servidor` tambien muestra
swap y carga del CPU. La ocupacion de memoria no equivale a carga del CPU.

## Accion y limites

- Examina exclusivamente `/tmp`: las familias de nombres de compilaciones y
  reparaciones revisadas estan enumeradas en `serverRelief.service.js`.
- Acepta snapshots propios de mas de una hora y archivos reconocidos de builds.
  Omite snapshots en uso por procesos del mismo usuario, enlaces, archivos de otro propietario, secretos, bases de datos,
  respaldos, uploads y nombres desconocidos.
- Copia a `~/.strbx-server-relief/<fecha-id>/`, privado y fuera de tmpfs.
  Verifica SHA-256, lectura e integridad de cada copia; sincroniza las copias y
  su manifiesto antes de retirar los originales, archivo por archivo.
- Conserva todos los archivos archivados. Los manifiestos incluyen ruta
  original, tamano y SHA-256 para comprobar y recuperar cada archivo.
- Mantiene al menos 512 MiB libres en el disco de destino y limita cada pasada
  a 256 MiB. Si no hay espacio para conservar una copia, mantiene el original.
- Bloquea ejecuciones simultaneas dentro del bot y aplica una espera de cinco
  minutos entre pasadas. El API debe usar una sola instancia del bot de polling.
- No reinicia servicios, no ejecuta swapoff, no vacia caches del kernel ni
  llama la limpieza diaria de systemd. Esa tarea tiene su propia politica.

Un resultado sin archivos liberados es valido: el bot informa si faltan
temporales reconocidos o si hubo omisiones. No promete reducir el consumo de
procesos activos. El disco disponible puede disminuir al preservar archivos
que antes estaban en RAM.

Para nuevos despliegues, preparar los artefactos en disco, por ejemplo en un
directorio privado bajo `~/.strbx-deploy-staging`, y publicar con el script
atomico existente. Si un build revisado se prepara excepcionalmente en `/tmp`,
el nombre admitido es `strbx-frontend-stage-AAAAMMDDhhmmss-<sha>`.

## Verificacion y recuperacion

Pruebas locales:

```sh
node --test backend/test/serverRelief.test.js backend/test/telegramServerRelief.test.js backend/test/serverResources.test.js
```

Los archivos de historial no se publican ni se agregan a Git. Antes de recuperar,
verificar cada hash contra el manifiesto. Copiar a un destino nuevo en disco,
nunca sobre un checkout o release activo. Una pasada incompleta conserva las
copias y los archivos pendientes para revision. No borrar el historial.
