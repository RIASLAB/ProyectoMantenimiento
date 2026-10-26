#!/usr/bin/env bash
# Respaldo del CMMS (NFR-01): base de datos + archivos adjuntos (manuales, fotos), en un solo archivo.
#
# Variables:
#   DATABASE_URL       postgres://usuario:clave@servidor:puerto/base   (obligatoria)
#   UPLOADS_DIR        carpeta de archivos adjuntos                      (por defecto ./uploads)
#   BACKUP_DIR         dónde se guardan los respaldos                    (por defecto ./respaldos)
#   RETENCION_DIAS     días que se conservan los respaldos               (por defecto 30)
#   BACKUP_PASSPHRASE  si se define, el respaldo se cifra (AES-256)      (recomendado)
#   BACKUP_COPIA_DIR   segunda carpeta (NAS, disco externo) donde se copia cada respaldo (opcional)
#
# Resultado: $BACKUP_DIR/cmms-AAAAMMDD-HHMMSS.tar (o .tar.enc si está cifrado)
set -euo pipefail

: "${DATABASE_URL:?Defina DATABASE_URL}"
UPLOADS_DIR="${UPLOADS_DIR:-./uploads}"
BACKUP_DIR="${BACKUP_DIR:-./respaldos}"
RETENCION_DIAS="${RETENCION_DIAS:-30}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
falla() { log "ERROR: $*" >&2; exit 1; }

for cmd in pg_dump pg_restore psql tar sha256sum; do command -v "$cmd" >/dev/null || falla "falta el programa $cmd"; done
[[ -n "${BACKUP_PASSPHRASE:-}" ]] && { command -v openssl >/dev/null || falla "falta openssl para cifrar"; }

mkdir -p "$BACKUP_DIR"
NOMBRE="cmms-$(date '+%Y%m%d-%H%M%S')"
N=1; while compgen -G "$BACKUP_DIR/$NOMBRE.tar*" >/dev/null; do N=$((N + 1)); NOMBRE="cmms-$(date '+%Y%m%d-%H%M%S')-$N"; done
TMP="$(mktemp -d "${BACKUP_DIR%/}/.tmp-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/$NOMBRE"
D="$TMP/$NOMBRE"

log "Respaldando la base de datos…"
pg_dump --dbname="$DATABASE_URL" --format=custom --compress=6 --no-owner --no-privileges --file="$D/base.dump"
pg_restore --list "$D/base.dump" >/dev/null || falla "el volcado de la base no es válido"

if [[ -d "$UPLOADS_DIR" ]]; then
  log "Respaldando archivos adjuntos de $UPLOADS_DIR…"
  tar -czf "$D/archivos.tar.gz" -C "$UPLOADS_DIR" .
else
  log "Aviso: no existe $UPLOADS_DIR; el respaldo no lleva archivos adjuntos"
  mkdir -p "$TMP/vacio" && tar -czf "$D/archivos.tar.gz" -C "$TMP/vacio" .
fi

# Conteos de control: la restauración los compara para confirmar que no falta nada.
psql "$DATABASE_URL" -At -F ' ' -c "
  SELECT 'tabla', relname, n FROM (
    SELECT c.relname, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint AS n
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'migrations'
  ) t ORDER BY relname" > "$D/conteos.txt"
{
  echo "respaldo $NOMBRE"
  echo "creado $(date -Iseconds)"
  echo "archivos $(tar -tzf "$D/archivos.tar.gz" | grep -vc '/$' || true)"
  echo "ultima_migracion $(psql "$DATABASE_URL" -At -c 'SELECT name FROM migrations ORDER BY id DESC LIMIT 1')"
} > "$D/info.txt"
(cd "$D" && sha256sum base.dump archivos.tar.gz conteos.txt info.txt > SHA256SUMS)

tar -cf "$TMP/$NOMBRE.tar" -C "$TMP" "$NOMBRE"
DESTINO="$BACKUP_DIR/$NOMBRE.tar"
if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  DESTINO="$DESTINO.enc"
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -in "$TMP/$NOMBRE.tar" -out "$DESTINO.parcial"
else
  log "Aviso: respaldo SIN cifrar (defina BACKUP_PASSPHRASE para cifrarlo)"
  cp "$TMP/$NOMBRE.tar" "$DESTINO.parcial"
fi
mv "$DESTINO.parcial" "$DESTINO"   # nunca queda un respaldo a medias con el nombre final
chmod 600 "$DESTINO"
log "Respaldo listo: $DESTINO ($(du -h "$DESTINO" | cut -f1))"

if [[ -n "${BACKUP_COPIA_DIR:-}" ]]; then
  mkdir -p "$BACKUP_COPIA_DIR"
  cp "$DESTINO" "$BACKUP_COPIA_DIR/" && log "Copia en $BACKUP_COPIA_DIR" || falla "no se pudo copiar a $BACKUP_COPIA_DIR"
fi

# Retención: se borran los respaldos más viejos, pero nunca el más reciente.
for dir in "$BACKUP_DIR" ${BACKUP_COPIA_DIR:+"$BACKUP_COPIA_DIR"}; do
  find "$dir" -maxdepth 1 -type f -name 'cmms-*.tar*' -mtime "+$RETENCION_DIAS" ! -name "$(basename "$DESTINO")" -print -delete | sed 's/^/Borrado por antigüedad: /'
done
