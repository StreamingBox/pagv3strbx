# Integración del CRM con la API de Streaming Box

Esta guía conecta el frontend de `https://crm.strbx.com.co` con la API existente de la página. El backend ya contiene las operaciones de administración; esta integración autoriza el origen exacto del CRM y reutiliza la autenticación y los permisos existentes. No se crea una segunda base de datos ni se expone acceso directo a MySQL.

## Direcciones

- CRM: `https://crm.strbx.com.co`
- API: `https://strbx.com.co/api`
- Estado de la API: `GET https://strbx.com.co/api/health`

La allowlist incluye este origen HTTPS del CRM y los orígenes oficiales de Streaming Box. `CORS_EXTRA_ORIGINS` puede agregar otros orígenes configurados explícitamente; no se permite `*` con credenciales.

## Autenticación

Usa una cuenta activa del sitio con rol `admin`. El login del backend establece cookies `Secure`, `HttpOnly` y `SameSite=Strict`; el navegador las envía a la API cuando cada llamada usa `credentials: "include"`. El CRM no debe leer, copiar, registrar ni guardar esas cookies o la contraseña en `localStorage`, `sessionStorage` o logs.

```js
const API_BASE = "https://strbx.com.co/api";
let refreshInFlight = null;

async function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function apiRequest(path, options = {}, retryAfterRefresh = true) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    cache: "no-store",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (
    response.status === 401 &&
    retryAfterRefresh &&
    path !== "/auth/login" &&
    path !== "/auth/refresh" &&
    await refreshSession()
  ) {
    return apiRequest(path, options, false);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function login(email, password) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function currentUser() {
  return apiRequest("/auth/me");
}

export async function logout() {
  return apiRequest("/auth/logout", { method: "POST" });
}
```

Después del login, llama `GET /auth/me` y comprueba `user.role === "admin"` antes de mostrar herramientas administrativas. Las rutas administrativas vuelven a validar el rol en el servidor: ocultar botones en el CRM no sustituye esa autorización.

Si una petición protegida devuelve `401`, intenta una sola vez `POST /auth/refresh` con `credentials: "include"` y repite la petición original. Si vuelve a fallar, solicita iniciar sesión de nuevo. Un usuario autenticado sin rol de administrador recibirá `403` en las rutas restringidas.

## Operaciones administrativas existentes

Las rutas se expresan debajo de `https://strbx.com.co/api`. Los métodos y campos aceptados dependen de cada operación; conserva sus validaciones y no asumas que un `PATCH` equivale a reemplazar el recurso completo.

| Área | Rutas principales |
| --- | --- |
| Usuarios y actividad | `GET/POST /admin/users`, `GET /admin/users/stats`, `GET /admin/users/:id/activity`, `PATCH /admin/users/:id`, `PATCH /admin/users/:id/password` |
| Inventario | `GET /admin/inventory`, `GET /admin/sales/inventory`, `GET /admin/inventory/:id/detail`, `PATCH /admin/inventory/:id`, `POST /admin/inventory/:id/sell` |
| Pedidos y vencimientos | `GET /admin/orders`, `GET /admin/orders/:id`, `POST /admin/orders/:id/attend`, `GET /admin/orders-expiring`, `GET /admin/orders-expiring-count` |
| Plataformas y catálogo | `GET/POST/PATCH /admin/platforms`, `GET/POST/PATCH/DELETE /admin/prices`, `GET/POST/PATCH/DELETE /admin/durations` |
| Proveedores | `GET/POST/PATCH /admin/providers`, `GET/POST/PATCH/DELETE /admin/provider-accounts` |
| Cuentas maestras | `GET/POST/PATCH/DELETE /admin/master-accounts` |
| Analítica | `/admin/analytics/*` |
| Soporte | `/admin/support-tickets/*`, `/admin/support-templates/*`, `/admin/support/subscription/:id`, `/admin/support/replace-account` |
| Códigos y trazabilidad | `GET /admin/code-logs`, `GET /admin/code-resets/:orderNumber`, `POST /admin/code-resets` |

### Venta de varias plataformas desde el CRM

`POST /admin/inventory/sell` acepta una venta de 1 a 10 artículos en una sola
operación. El cuerpo contiene `userId` y `items`, cada uno con un `accountId` y
un `platformPriceId`. La misma cuenta no puede repetirse. El servidor vuelve a
validar stock, vencimiento, plan activo, equivalencia y moneda dentro de una
transacción; calcula el total desde los precios actuales y crea un solo pedido,
un solo débito y la entrega combinada. Si cualquier artículo falla, se revierte
el pedido completo. Las ventas individuales conservan la ruta existente
`POST /admin/inventory/:id/sell` y su respuesta.

```json
{
  "userId": 57,
  "items": [
    { "accountId": 9336, "platformPriceId": 21 },
    { "accountId": 9352, "platformPriceId": 38 }
  ]
}
```

La respuesta incluye `orderId`, `orderCode`, `total`, `currency`, `newBalance`,
metadatos de cada artículo y `deliveryMessage`. Los datos de credenciales
aparecen únicamente dentro del mensaje de entrega, después de confirmarse la
venta. Como toda escritura de venta, el cliente no debe repetir la petición
automáticamente después de un resultado de red incierto; debe revisar el pedido.

La fuente de verdad para parámetros, validaciones y respuestas de cada operación son los routers en `backend/src/routes/`. Las rutas sensibles (venta, reemplazo, contraseñas, OTP, credenciales y datos de clientes) deben invocarse solo desde acciones explícitas del operador y nunca registrarse en la consola del navegador.

### Inventario reservable para venta desde el CRM

`GET /admin/sales/inventory?platformId=<id>&page=1&limit=20` devuelve las cuentas disponibles para vender el producto solicitado, incluyendo sus equivalencias configuradas y activas en `platform_fallbacks`. Sigue el catálogo: primero usa inventario directo y solo ofrece equivalencias cuando no queda stock directo; aplica los mismos filtros de disponibilidad, plataforma activa y vencimiento. La respuesta contiene únicamente `id`, `platform_id`, `platform_name`, `status`, `sale_priority` y `used_fallback`; no expone contraseña, PIN, 2FA ni correo.

`POST /admin/inventory/:id/sell` acepta una cuenta de esa lista cuando pertenece al producto solicitado o a una equivalencia activa. El servidor vuelve a validar la relación dentro de la transacción antes de descontar el saldo; guarda la plataforma elegida y la plataforma realmente entregada en la suscripción y en el detalle del pedido. Una equivalencia desactivada o ajena al producto no se puede vender.

## Errores y seguridad

- `401`: sesión ausente, expirada o inválida. Refresca una vez y, si persiste, pide login.
- `403`: el origen o el rol no está autorizado.
- `404`: ruta o recurso inexistente.
- `429`: límite de solicitudes; aplica espera y reintento con backoff.
- `5xx`: error del servicio; muestra un mensaje genérico y no repitas acciones de escritura automáticamente.
- Todas las escrituras desde el navegador deben incluir cookies y el origen CRM. El backend comprueba CORS y el origen de las peticiones mutables.
- No incluyas secretos de API en el bundle del CRM. Las claves de sesión/chat compartidas para un asistente no son credenciales de esta API y no deben enviarse como autenticación.
- Si en el futuro el CRM necesita llamadas servidor-a-servidor, debe diseñarse una credencial separada, con alcance mínimo, rotación y almacenamiento en backend; nunca una clave maestra en JavaScript.

## Implementación del lado del CRM

1. Configura la base `https://strbx.com.co/api` solo en el servidor de build del CRM; no uses IP directa ni HTTP.
2. Implementa login, consulta de sesión, refresh de sesión y logout mediante las funciones anteriores.
3. Mantén las pantallas administrativas detrás del rol `admin` y deja que el backend valide cada operación.
4. Al publicar el CRM, prueba login, `GET /auth/me`, una lectura administrativa y logout desde `https://crm.strbx.com.co`. No uses datos reales para probar escrituras.

No cambies `FRONTEND_URL` para conectar el CRM: esa variable se usa para enlaces y comunicaciones del sitio. La autorización del navegador se controla con la allowlist CORS del backend.
