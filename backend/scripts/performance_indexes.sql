-- ============================================================
-- ÍNDICES DE PERFORMANCE — StreamingBox PageV3
-- Ejecutar estos comandos en la base de datos de producción.
-- Usa CREATE INDEX IF NOT EXISTS (disponible en MySQL 8+ / MariaDB 10.1.4+)
-- ============================================================

-- 1. Índice compuesto para el cálculo de stock en el catálogo.
--    Afecta: GET /catalog (se ejecuta en CADA carga del dashboard)
--    Evita full table scan en platform_accounts.
CREATE INDEX IF NOT EXISTS idx_pa_stock
    ON platform_accounts (platform_id, status, expires_at);

-- 2. Índice para la página de vencimientos del admin.
--    Afecta: GET /admin/orders-expiring
--    Evita full table scan al filtrar por expires_at + status.
CREATE INDEX IF NOT EXISTS idx_sub_expires
    ON subscriptions (expires_at, status);

-- 3. Índice para búsquedas por user_id en analytics.
--    Afecta: GET /analytics/sales, /analytics/available-months
--    Acelera los filtros WHERE user_id = ? AND YEAR(...) = ?
CREATE INDEX IF NOT EXISTS idx_orders_user_date
    ON orders (user_id, created_at);

-- 4. Índice para la tabla order_items en analytics de distribución.
--    Afecta: el JOIN en curDistQuery en analytics.js
CREATE INDEX IF NOT EXISTS idx_order_items_order
    ON order_items (order_id, platform_id);

-- ============================================================
-- Verificar índices creados (opcional):
-- SHOW INDEX FROM platform_accounts;
-- SHOW INDEX FROM subscriptions;
-- SHOW INDEX FROM orders;
-- SHOW INDEX FROM order_items;
-- ============================================================
