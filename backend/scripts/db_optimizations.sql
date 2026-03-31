-- Script de Optimizaciones (Índices SQL)

-- 1. Agilizar filtros y reportes de ventas por usuario y tiempo.
CREATE INDEX idx_orders_user_created ON orders(user_id, created_at);

-- 2. Agilizar reportes globales por mes/año para el admin_analytics
CREATE INDEX idx_orders_created ON orders(created_at);

-- 3. Agilizar conteos o sumatorias de distribucion por plataforma
CREATE INDEX idx_order_items_order_platform ON order_items(order_id, platform_id);

-- 4. Optimizar las búsquedas y ordenamientos en los logs de WhatsApp
CREATE INDEX idx_whatsapp_queue_status_time ON whatsapp_queue(wa_status_label, created_at);
