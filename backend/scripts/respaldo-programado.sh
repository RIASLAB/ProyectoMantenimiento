#!/usr/bin/env bash
# Ejecuta respaldo.sh todos los días a la hora RESPALDO_HORA (HH:MM, hora local; por defecto 02:30).
# Pensado para el contenedor "respaldo" de docker-compose.prod.yml; en un servidor sin Docker use cron.
# Si un respaldo falla lo reintenta una hora después; la falla queda en el registro del contenedor.
set -uo pipefail
HORA="${RESPALDO_HORA:-02:30}"
[[ "$HORA" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || { echo "RESPALDO_HORA inválida: $HORA (use HH:MM)" >&2; exit 2; }
DIR="$(cd "$(dirname "$0")" && pwd)"

segundos_hasta() {
  local ahora objetivo
  ahora=$(( 10#$(date +%H) * 3600 + 10#$(date +%M) * 60 + 10#$(date +%S) ))
  objetivo=$(( 10#${HORA%:*} * 3600 + 10#${HORA#*:} * 60 ))
  echo $(( (objetivo - ahora + 86400) % 86400 ))
}

echo "Respaldos programados todos los días a las $HORA ($(date +%Z))"
[[ "${RESPALDO_AL_INICIAR:-no}" == "si" ]] && "$DIR/respaldo.sh"
while true; do
  espera=$(segundos_hasta); [[ $espera -eq 0 ]] && espera=86400
  echo "Próximo respaldo en $((espera / 3600)) h $(((espera % 3600) / 60)) min"
  sleep "$espera"
  if ! "$DIR/respaldo.sh"; then
    echo "El respaldo falló; se reintenta en 1 hora" >&2
    sleep 3600
    "$DIR/respaldo.sh" || echo "El reintento también falló" >&2
  fi
done
