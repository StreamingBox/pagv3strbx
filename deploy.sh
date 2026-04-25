#!/bin/bash
set -euo pipefail

# Ejecutar este script en el VPS para desplegar desde GitHub.
# Requiere que INTERNAL_SERVICE_TOKEN exista en el entorno del proceso/PM2.

PROJECT_DIR="${PROJECT_DIR:-/var/www/pagv2strbx}"
REPO_BRANCH="${REPO_BRANCH:-main}"
GO_BIN="${GO_BIN:-go}"
NGINX_SITE_PATH="${NGINX_SITE_PATH:-}"

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "ERROR: falta variable obligatoria: $name" >&2
    exit 1
  fi
}

require_go_1262() {
  local version
  version="$("$GO_BIN" env GOVERSION 2>/dev/null || true)"
  if [ -z "$version" ]; then
    version="$("$GO_BIN" version | awk '{print $3}')"
  fi

  case "$version" in
    go1.26.2|go1.26.[3-9]*|go1.2[7-9]*|go[2-9].*) ;;
    *)
      echo "ERROR: se requiere Go 1.26.2 o superior; encontrado: $version" >&2
      echo "Configura GO_BIN=/ruta/a/go1.26.2 si tienes varias versiones instaladas." >&2
      exit 1
      ;;
  esac
}

build_go_service() {
  local dir="$1"
  local output="$2"
  echo "Compilando $dir -> $output"
  (cd "$PROJECT_DIR/$dir" && "$GO_BIN" build -trimpath -o "$output" .)
}

echo "========================================="
echo "  Desplegando Streaming Box (pageV3)"
echo "========================================="

require_env INTERNAL_SERVICE_TOKEN
require_go_1262

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

echo "6. Compilando servicios Go con $("$GO_BIN" env GOVERSION)..."
build_go_service "go-backend/api-gateway" "api-gateway"
build_go_service "go-backend/codes-service" "codes"
build_go_service "go-backend/store-service" "store"

echo "7. Reiniciando PM2..."
GO_ENV=production pm2 restart ecosystem.config.cjs --env production --update-env

if [ -n "$NGINX_SITE_PATH" ]; then
  echo "8. Actualizando plantilla Nginx en $NGINX_SITE_PATH..."
  cp deploy/nginx/streaming-box.conf "$NGINX_SITE_PATH"
  nginx -t
  systemctl reload nginx
else
  echo "8. Nginx no modificado. Define NGINX_SITE_PATH para instalar deploy/nginx/streaming-box.conf."
fi

echo "========================================="
echo "  Despliegue completado."
echo "========================================="
