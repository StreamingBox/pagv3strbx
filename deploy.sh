#!/bin/bash

# Este script debe ser ejecutado EN EL VPS para desplegar los cambios desde GitHub.

# Configuración
PROJECT_DIR="/var/www/pagv3strbx"  # <-- Confirmado con la versión V3 basada en los chats anteriores
REPO_BRANCH="main"

echo "========================================="
echo "  Desplegando Streaming Box (pageV3)"
echo "========================================="

echo "1. Moviéndose al directorio del proyecto: $PROJECT_DIR"
cd "$PROJECT_DIR" || { echo "❌ Error: Directorio no encontrado."; exit 1; }

echo "2. Obteniendo últimos cambios de Git..."
git fetch origin
git reset --hard origin/$REPO_BRANCH

echo "3. Instalando dependencias del Backend..."
cd backend
npm install

echo "4. Instalando dependencias del Frontend..."
cd ../frontend
npm install

echo "5. Construyendo Frontend para Producción..."
npm run build

echo "6. Reiniciando procesos de PM2..."
pm2 restart all

echo "========================================="
echo "  ✅ Despliegue completado con éxito."
echo "========================================="
