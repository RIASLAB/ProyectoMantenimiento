# Despliegue del CMMS en 172.30.0.98

Fecha: 2026-11-04 (actualizado 2026-11-06). Este servidor ya tenía PostgreSQL 17 en el contenedor `postgres_db`.
El CMMS usa ese mismo PostgreSQL con dos bases independientes; no se instaló un segundo
contenedor de base de datos.

## Direcciones

| Ambiente | URL | Contenedor |
|---|---|---|
| Producción | http://172.30.0.98:8088 | `cmms-app-1` |
| Pruebas | http://172.30.0.98:8089 | `cmms-pruebas-app-1` |

El puerto 3000 del servidor sigue ocupado por `int_sap_pos_client`; el CMMS no lo usa.

## Bases de datos

| Ambiente | Base | Usuario | Contraseña |
|---|---|---|---|
| Producción | `cmms_produccion` | `cmms_prod` | En `.env.produccion` |
| Pruebas | `cmms_pruebas` | `cmms_test` | En `.env.pruebas` |

- PostgreSQL 17.11, contenedor `postgres_db`, red Docker `postgres_default`.
- Los usuarios son dueños de su base, no son superusuarios.
- No se tocan `leviathan_db` ni `leviathan_migtest`.
- La app aplica las migraciones sola al arrancar; el ambiente de pruebas tiene datos demo.

## Archivos

Directorio: `/home/ub-admin/apps/cmms`

| Archivo | Contenido | Permisos |
|---|---|---|
| `.env.produccion` | Secretos de producción (base, JWT, respaldo) | 600 |
| `.env.pruebas` | Secretos del ambiente de pruebas | 600 |
| `.admin-password` | Contraseña inicial del admin de producción | 600 |
| `.admin-password-test` | Contraseña inicial del admin de pruebas | 600 |
| `respaldos/` | Respaldos diarios cifrados de producción | 700, dueño `ub-admin` |
| `docker-compose.prod.externo.yml` | Producción con PostgreSQL externo | — |
| `docker-compose.pruebas.externo.yml` | Pruebas con PostgreSQL externo | — |

La contraseña inicial del admin de producción está en `.admin-password`; el sistema
obliga a cambiarla al primer ingreso.

## Operación

```bash
cd /home/ub-admin/apps/cmms

# Producción
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion ps
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion logs app --tail 50
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion restart app

# Pruebas
docker compose -f docker-compose.pruebas.externo.yml --env-file .env.pruebas ps
docker compose -f docker-compose.pruebas.externo.yml --env-file .env.pruebas logs app --tail 50

# Salud
curl http://172.30.0.98:8088/api/salud
curl http://172.30.0.98:8089/api/salud
```

La imagen se construye con el compose de producción y la reutiliza el de pruebas:

```bash
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion build
```

## Respaldos

El servicio `respaldo` corre todos los días a las 02:30 (America/Bogota), cifra con
AES-256, verifica el volcado y conserva 7 días (`RETENCION_DIAS=7`). Incluye base de
datos y archivos adjuntos. Los archivos quedan en `respaldos/`, propiedad de `ub-admin`,
para poder copiarlos a un NAS o a otro disco.

Respaldo manual:

```bash
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion \
  exec respaldo bash scripts/respaldo.sh
```

La clave de cifrado es `BACKUP_PASSPHRASE` de `.env.produccion`. **Guárdela también
fuera del servidor**: sin ella no se pueden restaurar los respaldos.

Prueba de restauración (se hizo con éxito el 2026-11-04: 36 tablas y 0 archivos):

```bash
docker exec -u postgres postgres_db createdb -O cmms_prod cmms_restaurada
mkdir -p restaurado && chmod 700 restaurado
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion \
  run --rm --user 1000:1000 \
  -v "$PWD/respaldos:/respaldos" -v "$PWD/restaurado:/restaurado" \
  --entrypoint bash respaldo -c '
    export DESTINO_DATABASE_URL="${DATABASE_URL%/*}/cmms_restaurada"
    export DESTINO_UPLOADS_DIR=/restaurado/uploads
    exec bash scripts/restaurar.sh "$1"
  ' -- /respaldos/cmms-AAAAMMDD-HHMMSS.tar.enc
docker exec -u postgres postgres_db dropdb --if-exists cmms_restaurada
rm -rf restaurado
```

## Actualización

GitHub Actions publica la imagen en `ghcr.io/riaslab/proyectomantenimiento` con las etiquetas
`latest` y `sha-xxxxxxx`. El cron de `ub-admin` (cada 5 minutos, `deploy/cmms-actualizar.sh`) actualiza
**solo pruebas** con `latest`. **Producción** se actualiza a mano, después de revisar pruebas:

```bash
cd /home/ub-admin/apps/cmms
./deploy/pasar-a-produccion.sh            # la versión que está en pruebas, con respaldo previo
./deploy/pasar-a-produccion.sh sha-xxxxxxx   # una versión puntual (volver atrás)
```

El script fija `IMAGE_TAG` en `.env.produccion`, así que producción nunca cambia sola. La guía
completa está en [guia-jhon.md](guia-jhon.md).

El `Dockerfile` de este despliegue usa `postgresql17-client` para que `pg_dump` coincida
con PostgreSQL 17. Los compose externos, el workflow y la guía están versionados en el
repositorio. El paquete de GHCR es privado; el servidor necesita un token con
`read:packages` y `docker login ghcr.io` como `ub-admin`. Para volver atrás:
`./deploy/pasar-a-produccion.sh sha-xxxxxxx`.

## Pendiente para producción definitiva

- La app está en HTTP. Funciona en la red de planta, pero **sin HTTPS no hay PWA
  instalable, modo sin conexión ni Web Push**. Además, las credenciales viajan sin cifrar.
- Para HTTPS interno: certificado de la CA de la empresa/AD CS, o la CA interna de Caddy
  instalada en cada dispositivo.
- Para acceso remoto: ngrok con dominio estático (plan pago) apuntando al puerto 8088.
  ngrok expone la web y su API; la base de datos y el SSH siguen internos. El plan gratis
  cambia la URL al reiniciar y muestra una página intermedia, lo que rompe la PWA y las
  suscripciones de push.
- Configurar VAPID (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) cuando exista
  HTTPS, y activar los avisos desde la app.
- Copiar `respaldos/` a un NAS o a otro disco y probar la restauración desde esa copia.
