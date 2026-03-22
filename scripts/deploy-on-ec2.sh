#!/usr/bin/env bash
# Ejecutar EN EL SERVIDOR EC2 (Ubuntu), dentro del clon del repo.
# Instala dependencias, construye el frontend y reinicia el backend con PM2.
#
# Uso (en EC2):
#   cd /var/www/pageV3
#   chmod +x scripts/deploy-on-ec2.sh
#   ./scripts/deploy-on-ec2.sh
#
# Variables opcionales:
#   PM2_APP=pagev3-api   nombre del proceso en PM2 (default: pagev3-api)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PM2_APP="${PM2_APP:-pagev3-api}"

echo ">>> git pull"
git pull --ff-only

echo ">>> backend: npm ci"
(cd backend && npm ci)

echo ">>> frontend: npm ci && build"
(cd frontend && npm ci && npm run build)

if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  echo ">>> pm2 restart $PM2_APP"
  pm2 restart "$PM2_APP"
else
  echo ">>> pm2 start (primera vez)"
  (cd backend && pm2 start src/index.js --name "$PM2_APP")
  pm2 save
fi

echo ">>> Listo. Comprueba: curl -sI http://127.0.0.1:3000/ | head -3"
pm2 status
