#!/usr/bin/env bash
# Actualiza el CMMS del servidor .98 con la imagen publicada en GitHub Container Registry.
# Pensado para el cron de ub-admin cada 5 minutos. Actualiza primero pruebas y luego producción.
set -euo pipefail

export HOME=/home/ub-admin
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RAIZ=/home/ub-admin/apps/cmms
cd "$RAIZ"

# Evita dos ejecuciones simultáneas.
exec 9>"$RAIZ/.deploy.lock"
flock -n 9 || exit 0

log() { echo "[$(date -Is)] $*"; }

log "Buscando cambios en GitHub…"
git pull --ff-only origin main

# 1) Pruebas primero: si la imagen nueva no arranca, producción no se toca.
log "Actualizando pruebas…"
docker compose -f docker-compose.pruebas.externo.yml --env-file .env.pruebas pull app
docker compose -f docker-compose.pruebas.externo.yml --env-file .env.pruebas up -d
for _ in $(seq 1 12); do
  curl -fsS http://172.30.0.98:8089/api/salud >/dev/null 2>&1 && break
  sleep 5
done
curl -fsS http://172.30.0.98:8089/api/salud >/dev/null 2>&1 || {
  log "ERROR: pruebas no responde; producción no se actualiza"
  exit 1
}
log "Pruebas OK"

# 2) Producción. Si la imagen cambió, respaldar antes de aplicar migraciones.
IMAGE_TAG=$(grep -E '^IMAGE_TAG=' .env.produccion 2>/dev/null | cut -d= -f2- || true)
IMAGE_TAG=${IMAGE_TAG:-latest}
IMAGEN="ghcr.io/riaslab/proyectomantenimiento:$IMAGE_TAG"

ANTERIOR=$(docker inspect -f '{{.Image}}' cmms-app-1 2>/dev/null || true)
log "Actualizando producción…"
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion pull app respaldo
NUEVA=$(docker image inspect -f '{{.Id}}' "$IMAGEN")

if [ -n "$ANTERIOR" ] && [ "$ANTERIOR" != "$NUEVA" ]; then
  log "Imagen nueva detectada; respaldando producción antes de actualizar…"
  docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion up -d respaldo
  docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion exec -T respaldo bash scripts/respaldo.sh
fi

docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion up -d
for _ in $(seq 1 12); do
  curl -fsS http://172.30.0.98:8088/api/salud >/dev/null 2>&1 && break
  sleep 5
done
curl -fsS http://172.30.0.98:8088/api/salud >/dev/null 2>&1 || {
  log "ERROR: producción no responde"
  exit 1
}
log "Producción OK. Actualización terminada."
