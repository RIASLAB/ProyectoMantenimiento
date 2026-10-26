#!/usr/bin/env bash
# Restaura un respaldo del CMMS en una base de datos y una carpeta de archivos.
#
# Uso:  restaurar.sh <respaldo.tar | respaldo.tar.enc> [--si]
#
# Variables:
#   DESTINO_DATABASE_URL  base donde restaurar (debe existir; se recomienda una base NUEVA y vacía)
#   DESTINO_UPLOADS_DIR   carpeta donde dejar los archivos adjuntos
#   BACKUP_PASSPHRASE     clave, si el respaldo está cifrado
#
# Si la base destino ya tiene datos, se exige --si (se reemplazan por los del respaldo).
# Al final compara los conteos de cada tabla con los del momento del respaldo.
set -euo pipefail

ARCHIVO="${1:-}"; CONFIRMA="${2:-}"
[[ -f "$ARCHIVO" ]] || { echo "Uso: $0 <respaldo.tar|respaldo.tar.enc> [--si]" >&2; exit 2; }
: "${DESTINO_DATABASE_URL:?Defina DESTINO_DATABASE_URL (base donde restaurar)}"
: "${DESTINO_UPLOADS_DIR:?Defina DESTINO_UPLOADS_DIR (carpeta para los archivos adjuntos)}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
falla() { log "ERROR: $*" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ "$ARCHIVO" == *.enc ]]; then
  : "${BACKUP_PASSPHRASE:?El respaldo está cifrado: defina BACKUP_PASSPHRASE}"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$ARCHIVO" -out "$TMP/r.tar" 2>/dev/null \
    || falla "no se pudo descifrar (¿clave equivocada?)"
else
  cp "$ARCHIVO" "$TMP/r.tar"
fi
tar -xf "$TMP/r.tar" -C "$TMP" || falla "el archivo no es un respaldo válido"
D="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d -name 'cmms-*' | head -1)"
[[ -n "$D" ]] || falla "el archivo no es un respaldo del CMMS"
(cd "$D" && sha256sum -c SHA256SUMS >/dev/null 2>&1) || falla "el respaldo está dañado (no coinciden las sumas de verificación)"
log "Respaldo íntegro: $(head -1 "$D/info.txt" | cut -d' ' -f2), $(grep '^creado' "$D/info.txt" | cut -d' ' -f2)"

TABLAS="$(psql "$DESTINO_DATABASE_URL" -At -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
if [[ "$TABLAS" != "0" && "$CONFIRMA" != "--si" ]]; then
  falla "la base destino ya tiene $TABLAS tablas. Para reemplazar su contenido repita con --si"
fi

log "Restaurando la base de datos…"
psql "$DESTINO_DATABASE_URL" -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
pg_restore --dbname="$DESTINO_DATABASE_URL" --no-owner --no-privileges --exit-on-error --single-transaction "$D/base.dump"

log "Restaurando archivos adjuntos en $DESTINO_UPLOADS_DIR…"
mkdir -p "$DESTINO_UPLOADS_DIR"
tar -xzf "$D/archivos.tar.gz" -C "$DESTINO_UPLOADS_DIR"

log "Comparando conteos…"
DIF=0
while read -r _ tabla esperado; do
  real="$(psql "$DESTINO_DATABASE_URL" -At -c "SELECT count(*) FROM \"$tabla\"")"
  if [[ "$real" != "$esperado" ]]; then echo "  $tabla: respaldo $esperado, restaurado $real"; DIF=1; fi
done < "$D/conteos.txt"
ESPERADOS="$(grep '^archivos' "$D/info.txt" | cut -d' ' -f2)"
REALES="$(find "$DESTINO_UPLOADS_DIR" -type f | wc -l | tr -d ' ')"
[[ "$REALES" -ge "$ESPERADOS" ]] || { echo "  archivos: respaldo $ESPERADOS, restaurados $REALES"; DIF=1; }
[[ $DIF -eq 0 ]] || falla "la restauración no coincide con el respaldo"
log "Restauración correcta: $(wc -l < "$D/conteos.txt" | tr -d ' ') tablas y $ESPERADOS archivos coinciden con el respaldo"
