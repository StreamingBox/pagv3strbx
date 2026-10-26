# Programa de referidos

## Estado inicial y reglas

- La migración 057 crea el módulo apagado, con premio de 10.000 COP. No acredita dinero ni asocia cuentas antiguas.
- Administración configura el premio fijo en `/admin/referrals`, pestaña Configuración. Activar exige un premio mayor a cero; no puede superar la recarga mínima.
- Valores definidos: 10.000 COP para quien refiere, al acumular el invitado 50.000 COP en recargas aprobadas durante los 30 días posteriores al registro. Son configurables; no son un porcentaje ni un premio para el invitado.
- Solo clientes con rol `user`, estado `active` y moneda COP pueden invitar y recibir premios. También el invitado debe estar activo en COP al acreditar.
- Cada cliente tiene un código estable y un enlace `/register?ref=...`. Los códigos son públicos, no credenciales. No exponen la identidad del referente en una API pública.
- La atribución solo se crea dentro de la transacción de un registro nuevo. Un invitado tiene como máximo un referente y no puede referirse a sí mismo. Una cuenta existente no puede agregar un referente después.
- Se capturan versión de configuración, premio, mínimo y vencimiento al registrarse mientras la campaña está activa. Pausarla o cambiar el premio solo afecta nuevos registros.
- La ventana es de 30 días corridos desde el registro, no un mes calendario. Se cuenta la **aprobación**, no la presentación del comprobante. Se suman los principales de todas las recargas COP aprobadas dentro de la ventana hasta alcanzar la meta. Por ejemplo 20.000 + 15.000 + 15.000 = 50.000 COP. Los bonos no suman; una recarga fuera del plazo no completa la meta. Un identificador de recarga no puede sumar dos veces.
- El programa utiliza el flujo común `updateManualTopupStatus`: aprobación manual y conciliación automática Bre-B/Binance. No cuentan solicitudes rechazadas, ajustes de saldo de administración, premios ni compras.
- El premio se entrega una vez al referente, como saldo de compras. El bono habitual de recargas del invitado se conserva; no se añade un segundo premio de bienvenida al invitado.

## Control administrativo

- Activación, inicio/fin opcionales en hora de Colombia, premio, mínimo, plazo, máximo de premios por referente/mes y presupuesto mensual global.
- Un límite mensual de 0 significa sin límite. Meses y filtros de fecha usan `America/Bogota`; la base guarda UTC.
- El presupuesto mide premios **brutos** entregados. Una reversión no libera presupuesto ni cupo, para evitar reutilización artificial de límites.
- Un premio que excede presupuesto/cupo, o cuyo cliente/billetera no es elegible, queda `review`. No se pierde y no se vuelve a pagar automáticamente: administración corrige la causa y usa Reevaluar premio.
- La reevaluación conserva el importe prometido y una meta alcanzada dentro del plazo, aunque el plazo haya vencido después. Comprueba el conjunto de recargas que contribuyeron: siguen aprobadas, son del mismo invitado, conservan importe y moneda y suman el acumulado registrado.
- Pendientes y premios en revisión pueden cancelarse con motivo. Los acreditados solo pueden revertirse con un movimiento compensatorio y motivo; nunca se borra el abono original. La reversión se bloquea si faltan fondos COP, no crea saldos negativos.
- Los cambios de campaña requieren `expectedVersion`: una edición obsoleta devuelve 409, sin sobreescribir otra sesión.
- Historial paginado, búsqueda por ID/nombre/correo/código, estado y fecha de registro. Excel incluye todos los registros filtrados hasta 10.000; por encima exige reducir el rango.

## Datos y atomicidad

`referral_codes`: un código por cliente; código único.

`referrals`: un registro por invitado, condiciones capturadas, acumulado, consentimiento, recarga que completó la meta y vínculos únicos a los movimientos de abono y reversión.

`referral_topups`: aportes a la meta con recarga única, importe principal y fecha de aprobación; no incluye bonos. El acumulado deja de crecer al completar la meta.

`referral_budget_usage`: contador mensual bloqueado para aplicar el presupuesto entre referentes concurrentes.

`referral_audit_log`: altas, configuración antes/después, revisiones, créditos, cancelaciones y reversiones con actor y fecha. No almacena contraseñas, OTP ni comprobantes.

La aprobación conserva una única transacción SQL para principal, bono de recarga, premio al referente, movimiento de billetera, contador y notificación. Un fallo de almacenamiento deshace todo. Los bloqueos y restricciones únicas impiden pagos repetidos por reintentos o aprobaciones simultáneas. Un deadlock/timeout SQL revierte la transacción; el operador puede repetir la aprobación, no se reintenta a ciegas una escritura de dinero.

Movimientos: `referral_bonus` positivo y `referral_reversal` negativo, ambos con `reference_type=referral` y `reference_id` del referido. No se modifican ganancias por ventas ni se cuenta un premio como recarga bancaria.

## API

Todas las respuestas son JSON y `Cache-Control: no-store`. Las escrituras conservan la protección de origen del backend.

| Método | Ruta bajo `/api` | Acceso | Uso |
| --- | --- | --- | --- |
| GET | `/referrals/campaign` | Público, limitado | Estado y condiciones públicas, sin identidades ni presupuestos |
| POST | `/auth/register` | Público, limitado existente | `referralCode` opcional y `referralConsent=true` para participar; registro y atribución atómicos |
| GET | `/referrals/me` | Sesión activa | Código/enlace propio, progreso, faltante y contacto autorizado de invitados; también la invitación propia |
| PUT | `/referrals/contact-consent` | Sesión activa | `{ "consent": false }` retira nombre/correo/progreso de la vista del referente; `true` vuelve a autorizar. Solo la invitación propia |
| GET | `/admin/referrals/settings` | Admin | Configuración, consumo mensual y últimos cambios |
| PUT | `/admin/referrals/settings` | Admin | Campos configurables y `expectedVersion` obligatorio |
| GET | `/admin/referrals` | Admin | Historial completo paginado |
| GET | `/admin/referrals/export` | Admin | JSON acotado para generar Excel en el cliente |
| GET | `/admin/referrals/:id` | Admin | Detalle y últimos 100 eventos |
| POST | `/admin/referrals/:id/cancel` | Admin | `{ "reason": "Motivo de revisión administrativa" }` |
| POST | `/admin/referrals/:id/retry` | Admin | Reevaluar un premio `review`, sin cambiar condiciones |
| POST | `/admin/referrals/:id/reverse` | Admin | Motivo obligatorio; débito compensatorio único |

Filtros: `status`, `from`, `to` (YYYY-MM-DD, límites inclusivos en Bogotá), `page`, `limit` (máximo 100). Solo administración admite `search` (máximo 120 caracteres). El endpoint personal siempre usa el ID autenticado e ignora identificadores de terceros en la consulta.

Errores: 400 validación, 401 sin sesión activa, 403 sin rol, 404 inexistente, 409 conflicto de versión/estado/saldo, 422 exportación demasiado grande. Fallos internos no devuelven SQL ni datos operativos.

## Privacidad y controles antifraude

El registro con código exige una autorización explícita para compartir nombre, correo y avance acumulado con quien invita. Es posible registrarse sin participar dejando el código vacío. El invitado puede retirar o volver a dar esa autorización en su vista Referidos. Al retirarla, nombre/correo/acumulado/faltante se ocultan inmediatamente al referente en las siguientes consultas, sin modificar el premio prometido. El premio propio y su estado se conservan en el historial del referente.

Con autorización, el referente ve el progreso y lo que falta para la meta, y dispone de un enlace `mailto:` para contactar voluntariamente al invitado. No se inventan teléfonos ni se envían mensajes automáticamente. No obtiene IDs de pagos, movimientos de billetera ni el desglose de recargas individuales. Solo administración puede consultar el desglose y exportar identidades y trazabilidad. La pantalla administrativa muestra las últimas 50 recargas computadas y los últimos 100 eventos, sin listas ilimitadas.

La aprobación manual del registro, las recargas confirmadas, los límites y la auditoría reducen abuso. No se rechazan automáticamente personas que comparten IP. No hay verificación de identidad legal ni una garantía de detectar cuentas distintas controladas por la misma persona: aliases y pagos sospechosos requieren revisión humana. Antes de lanzar, revisar el presupuesto de la campaña.

No se envían campañas masivas de correo ni mensajes WhatsApp automáticamente. Compartir abre un enlace que el cliente decide enviar; la acreditación/reversión genera una notificación interna transaccional.

## Verificación y despliegue

1. Ejecutar pruebas backend/frontend, lint, compilación completa y `frontend/scripts/verify-release.mjs`.
2. Probar integración contra MariaDB 11.8 en contenedores desechables, red aislada y datos sintéticos. La prueba solo se habilita con `REFERRALS_INTEGRATION_HOST` y exige `REFERRALS_INTEGRATION_DB=referrals_test`; nunca pasar la base real.
3. Antes de migrar datos en producción (`2.25.93.122`), crear un respaldo recuperable y verificarlo en Google Drive con los scripts del repositorio. No avanzar si Drive falla.
4. Desplegar API y web completas con el mismo commit. La migración es aditiva y la campaña sigue apagada. No bajar/eliminar las tablas al volver a la imagen anterior.
5. Comprobar salud, rutas, recursos y vistas, antes de configurar el premio y activar. Una publicación no activa por sí sola la campaña ni genera premios históricos.
