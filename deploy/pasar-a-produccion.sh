#!/usr/bin/env bash
# Pasa a producción la versión que está corriendo en pruebas, después de revisarla (D-39).
#   ./deploy/pasar-a-produccion.sh            muestra qué cambia, pide confirmar, respalda y actualiza
#   ./deploy/pasar-a-produccion.sh -y         sin preguntar
#   ./deploy/pasar-a-produccion.sh sha-abc1234   pone en producción una versión puntual (volver atrás)
# Producción queda fijada a esa versión (IMAGE_TAG en .env.produccion): el cron nunca la cambia.
set -euo pipefail

RAIZ=/home/ub-admin/apps/cmms
cd "$RAIZ"
log() { echo "[$(date -Is)] $*" | tee -a deploy/actualizar.log; }
PRUEBAS=(docker compose -f docker-compose.pruebas.externo.yml --env-file .env.pruebas)
PROD=(docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion)
REPO=ghcr.io/riaslab/proyectomantenimiento

SI=0; DESTINO=""
for a in "$@"; do
  case "$a" in
    -y|--si) SI=1 ;;
    sha-*) DESTINO="$a" ;;
    *) echo "Uso: $0 [-y] [sha-xxxxxxx]"; exit 2 ;;
  esac
done

# Espera a que el cron termine si está corriendo.
exec 9>"$RAIZ/.deploy.lock"
flock -w 300 9 || { echo "Hay otra actualización en curso; intente en unos minutos."; exit 1; }

revision() { docker inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$1" 2>/dev/null || true; }

if [ -z "$DESTINO" ]; then
  CID=$("${PRUEBAS[@]}" ps -q app)
  [ -n "$CID" ] || { echo "Pruebas no está corriendo."; exit 1; }
  curl -fsS http://172.30.0.98:8089/api/salud >/dev/null 2>&1 || { echo "Pruebas no responde: no se pasa nada a producción."; exit 1; }
  REV=$(revision "$CID")
  [ -n "$REV" ] || { echo "No se pudo saber la versión de pruebas."; exit 1; }
  DESTINO="sha-${REV:0:7}"
fi

ACTUAL_CID=$("${PROD[@]}" ps -q app 2>/dev/null || true)
ACTUAL_REV=$([ -n "$ACTUAL_CID" ] && revision "$ACTUAL_CID" || true)
NUEVA_REV=${REV:-}
if [ -n "$ACTUAL_REV" ]; then echo "Producción tiene:  sha-${ACTUAL_REV:0:7}"; else echo "Producción tiene:  (no se sabe)"; fi
echo "Pasaría a:         $DESTINO"
if [ -n "$ACTUAL_REV" ] && [ "sha-${ACTUAL_REV:0:7}" = "$DESTINO" ]; then
  echo "Producción ya tiene esta versión. No hay nada que hacer."
  exit 0
fi
git fetch --quiet origin main 2>/dev/null || true
if [ -n "$ACTUAL_REV" ] && [ -n "$NUEVA_REV" ] && git cat-file -e "$ACTUAL_REV" 2>/dev/null; then
  echo; echo "Cambios que entran a producción:"
  git log --format='  - %s' "$ACTUAL_REV..$NUEVA_REV" -- . ':(exclude)docs' ':(exclude)e2e' 2>/dev/null | head -40
fi
echo
if [ "$SI" -ne 1 ]; then
  read -r -p "¿Pasar esta versión a producción? Se hará un respaldo antes. (s/n) " R
  [[ "$R" =~ ^[sS]$ ]] || { echo "Cancelado."; exit 0; }
fi

docker pull --quiet "$REPO:$DESTINO" >/dev/null

log "Respaldando producción antes de pasar a $DESTINO…"
"${PROD[@]}" up -d respaldo >/dev/null
"${PROD[@]}" exec -T respaldo bash scripts/respaldo.sh

ANTERIOR=$(grep -E '^IMAGE_TAG=' .env.produccion | cut -d= -f2- || true)
if grep -qE '^IMAGE_TAG=' .env.produccion; then
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$DESTINO/" .env.produccion
else
  printf '\n# Versión de producción (la pone deploy/pasar-a-produccion.sh)\nIMAGE_TAG=%s\n' "$DESTINO" >> .env.produccion
fi

log "Actualizando producción a $DESTINO…"
"${PROD[@]}" up -d
for _ in $(seq 1 24); do
  curl -fsS http://172.30.0.98:8088/api/salud >/dev/null 2>&1 && break
  sleep 5
done
if curl -fsS http://172.30.0.98:8088/api/salud >/dev/null 2>&1; then
  log "Producción OK con $DESTINO."
else
  log "ERROR: producción no responde con $DESTINO (antes: ${ANTERIOR:-latest})."
  echo "Revise:   ${PROD[*]} logs --tail 100 app"
  echo "Volver:   ./deploy/pasar-a-produccion.sh ${ANTERIOR:-sha-xxxxxxx}   (y, si la base quedó mal, restaurar el respaldo: docs/despliegue-98.md)"
  exit 1
fi
