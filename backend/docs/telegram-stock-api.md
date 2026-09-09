# API de stock para un segundo bot de Telegram

El backend expone una consulta de solo lectura para que otro bot pueda responder
`/stock` sin conectarse directamente a MySQL ni recibir credenciales de cuentas.

## Configuración

Agrega en el `.env` del backend un token largo y privado:

```env
TELEGRAM_STOCK_API_TOKEN=un_token_largo_y_aleatorio
```

Puedes generar uno en el servidor con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

El mismo valor debe quedar únicamente en el segundo bot como secreto. No lo
incluyas en el frontend, en el repositorio ni en mensajes del bot.

## Endpoint

```text
GET https://strbx.com.co/api/integrations/telegram/stock
Authorization: Bearer <TELEGRAM_STOCK_API_TOKEN>
```

También acepta el encabezado `x-telegram-stock-token`.

Respuesta:

```json
{
  "ok": true,
  "generatedAt": "2026-09-06T12:00:00.000Z",
  "totalAvailable": 7,
  "items": [
    {
      "platformId": 12,
      "platform": "Netflix",
      "slug": "netflix",
      "available": 5,
      "total": 8
    }
  ]
}
```

Solo se incluyen plataformas activas con al menos una cuenta disponible, igual
que el `/stock` del bot administrativo. Nunca se devuelven correos,
contraseñas, PIN, perfiles ni proveedores.

## Ejemplo para el segundo bot

```js
const response = await fetch(
  `${process.env.STRBX_BASE_URL}/api/integrations/telegram/stock`,
  {
    headers: {
      Authorization: `Bearer ${process.env.STRBX_STOCK_API_TOKEN}`,
    },
    signal: AbortSignal.timeout(10000),
  }
);

if (!response.ok) {
  throw new Error(`Stock API HTTP ${response.status}`);
}

const data = await response.json();
const text = data.items.length
  ? data.items.map((item) =>
      `• ${item.platform}: ${item.available} disponibles / ${item.total} total`
    ).join("\n")
  : "No hay plataformas activas con stock.";
```

La API limita este endpoint a 60 consultas por minuto por origen y devuelve
`401` para tokens inválidos o `503` si el token no está configurado.
