#!/bin/bash
set -euo pipefail

# Ejecutar este script en el VPS para desplegar desde GitHub.

PROJECT_DIR="${PROJECT_DIR:-/var/www/pageV3}"
REPO_BRANCH="${REPO_BRANCH:-main}"
PM2_APP="${PM2_APP:-pagev3-api}"
NGINX_SITE_PATH="${NGINX_SITE_PATH:-}"

echo "========================================="
echo "  Desplegando Streaming Box (pageV3)"
echo "========================================="

cd "$PROJECT_DIR"

echo "1. Obteniendo ultimos cambios de Git..."
git fetch origin
git reset --hard "origin/$REPO_BRANCH"

echo "2. Instalando dependencias del backend..."
(cd backend && npm ci)

echo "3. Instalando dependencias del frontend..."
(cd frontend && npm ci)

echo "4. Auditando dependencias..."
npm audit --audit-level=high
(cd backend && npm audit --audit-level=high)
(cd frontend && npm audit --audit-level=high)

echo "5. Construyendo frontend de produccion..."
(cd frontend && npm run build)

echo "6. Reiniciando backend PM2..."
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
else
  (cd backend && pm2 start src/index.js --name "$PM2_APP" --update-env)
  pm2 save
fi

if [ -n "$NGINX_SITE_PATH" ]; then
  echo "7. Actualizando plantilla Nginx en $NGINX_SITE_PATH..."
  cp deploy/nginx/streaming-box.conf "$NGINX_SITE_PATH"
  nginx -t
  systemctl reload nginx
else
  echo "7. Nginx no modificado. Define NGINX_SITE_PATH para instalar deploy/nginx/streaming-box.conf."
fi

echo "========================================="
echo "  Despliegue completado."
echo "========================================="
