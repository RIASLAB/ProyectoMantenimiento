#!/usr/bin/env bash
# Cron de ub-admin cada 5 minutos (D-39): baja la imagen publicada en GitHub Container Registry y actualiza
# SOLO el ambiente de pruebas (http://172.30.0.98:8089). Producción no se toca aquí: pasa cuando se revisa
# en pruebas y se aprueba con  ./deploy/pasar-a-produccion.sh
set -euo pipefail

export HOME=/home/ub-admin
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RAIZ=/home/ub-admin/apps/cmms
cd "$RAIZ"

# Evita dos ejecuciones simultáneas (y que choque con un paso a producción).
exec 9>"$RAIZ/.deploy.lock"
flock -n 9 || exit 0

log() { echo "[$(date -Is)] $*"; }
PRUEBAS=(docker compose -f docker-compose.pruebas.externo.yml --env-file .env.pruebas)

git pull --ff-only --quiet origin main

ANTES=$(docker inspect -f '{{.Image}}' "$("${PRUEBAS[@]}" ps -q app 2>/dev/null)" 2>/dev/null || true)
"${PRUEBAS[@]}" pull --quiet app
"${PRUEBAS[@]}" up -d
DESPUES=$(docker inspect -f '{{.Image}}' "$("${PRUEBAS[@]}" ps -q app)" 2>/dev/null || true)
[ "$ANTES" = "$DESPUES" ] && exit 0   # sin versión nueva: no se escribe en el log

for _ in $(seq 1 12); do
  curl -fsS http://172.30.0.98:8089/api/salud >/dev/null 2>&1 && break
  sleep 5
done
REV=$(docker inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$("${PRUEBAS[@]}" ps -q app)" 2>/dev/null || true)
if curl -fsS http://172.30.0.98:8089/api/salud >/dev/null 2>&1; then
  log "Pruebas actualizada a la versión sha-${REV:0:7}: $(git log -1 --format=%s "$REV" 2>/dev/null || echo '')"
  log "Revísela en http://172.30.0.98:8089 y, si está bien, pásela a producción con: ./deploy/pasar-a-produccion.sh"
else
  log "ERROR: pruebas no responde con la versión sha-${REV:0:7}. Revise: ${PRUEBAS[*]} logs --tail 100 app"
  exit 1
fi
