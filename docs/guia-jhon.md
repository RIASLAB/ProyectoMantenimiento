# Guía para publicar cambios del CMMS

Esta guía es para Jhon (o cualquier persona que mantenga el proyecto). El flujo es:

```
Tu equipo ──git push──▶ GitHub (main)
                           │
                           ▼
                    GitHub Actions
                    construye la imagen
                           │
                           ▼
                 GHCR (imagen privada)
                           │
                           ▼
       .98, cron de ub-admin cada 5 minutos:
       git pull → docker compose pull → up -d
```

No hace falta entrar al servidor para publicar un cambio: con hacer `git push` a `main`
el servidor se actualiza solo, primero en pruebas y después en producción.

## 1. Publicar un cambio en GitHub

Si es la primera vez en tu equipo:

```bash
ssh-keygen -t ed25519 -C "jhon@nutricarnicos.com"
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

Copia la llave pública en GitHub → **Settings → SSH and GPG keys → New SSH key**.
Comprueba:

```bash
ssh -T git@github.com
```

Clona el repositorio (o cambia el remoto si ya lo tenías por HTTPS):

```bash
git clone git@github.com:RIASLAB/ProyectoMantenimiento.git
cd ProyectoMantenimiento

# Si ya estaba clonado por HTTPS:
git remote set-url origin git@github.com:RIASLAB/ProyectoMantenimiento.git
git remote -v
```

El día a día:

```bash
git pull --rebase origin main
# ... hacer los cambios ...
git add -A
git commit -m "Descripción clara del cambio"
git push origin main
```

El push dispara el workflow **Publicar imagen**. Revisa la pestaña **Actions** del
repositorio. Si está en verde, la imagen nueva quedó en GHCR.

> No subas `.env`, contraseñas, tokens ni la carpeta `respaldos/`. Ya están en
> `.gitignore`, pero revísalo antes de commitear.

## 2. El paquete de GHCR debe quedar privado

La imagen se publica en `ghcr.io/riaslab/proyectomantenimiento`. El paquete **debe
quedar privado**:

1. Entra a GitHub → tu perfil → **Packages** → `proyectomantenimiento`.
2. **Package settings** → **Change visibility** → **Private**.
3. Verifica que el paquete esté enlazado al repositorio `RIASLAB/ProyectoMantenimiento`.

Como la imagen es privada, el servidor necesita un token de lectura:

1. GitHub → **Settings → Developer settings → Personal access tokens → Tokens (classic)**.
2. Genera un token con el permiso **`read:packages`**.
3. En `.98`, como `ub-admin`, ejecuta (sin pegar el token en el chat ni en el repo):

```bash
echo "<TU_TOKEN>" | docker login ghcr.io -u <tu-usuario-github> --password-stdin
```

El token queda en `/home/ub-admin/.docker/config.json` (permisos 600). El cron lo usa.
Si el token se vence o se revoca, repite el `docker login`.

Comprueba que el servidor puede bajar la imagen:

```bash
docker pull ghcr.io/riaslab/proyectomantenimiento:latest
```

## 3. Conectarse al servidor `.98`

En tu `~/.ssh/config`:

```sshconfig
Host leviathan
  HostName 172.30.0.98
  User ub-admin
  IdentityFile ~/.ssh/id_ed25519
  # Si estás fuera de la red de la planta:
  # ProxyJump root@172.30.0.8
```

Si aún no tienes acceso:

```bash
ssh-copy-id ub-admin@172.30.0.98
```

Entra:

```bash
ssh leviathan
cd ~/apps/cmms
```

### Contexto Docker `leviathan`

Para ver y controlar contenedores desde tu equipo:

```bash
docker context create leviathan --docker "host=ssh://leviathan"
docker context use leviathan
docker ps

# Volver al Docker local:
docker context use default
```

Para `docker compose`, entra por SSH al servidor. Los montajes relativos de los compose
se resuelven mejor en el propio servidor:

```bash
ssh leviathan
cd ~/apps/cmms
```

## 4. Controlar los contenedores

```bash
cd ~/apps/cmms

# Producción
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion ps
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion logs -f --tail 100 app
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion restart app
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion stop
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion start
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion down

# Pruebas
docker compose -f docker-compose.pruebas.externo.yml --env-file .env.pruebas ps
docker compose -f docker-compose.pruebas.externo.yml --env-file .env.pruebas logs -f --tail 100 app

# Salud
curl http://172.30.0.98:8088/api/salud
curl http://172.30.0.98:8089/api/salud

# Uso de recursos
docker stats --no-stream
```

Servicios del stack:

| Servicio | Qué es |
|---|---|
| `app` | API NestJS + app React compilada |
| `respaldo` | Respaldo diario cifrado (solo producción) |
| `postgres_db` | PostgreSQL 17 existente del servidor; no es parte del stack |

## 5. Actualización automática

El cron de `ub-admin` corre cada 5 minutos:

```cron
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
HOME=/home/ub-admin
*/5 * * * * /home/ub-admin/apps/cmms/deploy/cmms-actualizar.sh >> /home/ub-admin/apps/cmms/deploy/actualizar.log 2>&1
```

El script hace:

1. `git pull --ff-only origin main`.
2. Actualiza `cmms_pruebas` y verifica su salud.
3. Si pruebas está bien, respalda producción cuando la imagen cambió.
4. Actualiza producción y verifica su salud.
5. Usa `flock` para que dos ejecuciones no se pisen.

Revisar el log:

```bash
tail -n 100 ~/apps/cmms/deploy/actualizar.log
```

Ejecutar la actualización a mano (sin esperar los 5 minutos):

```bash
~/apps/cmms/deploy/cmms-actualizar.sh
```

Si el log crece demasiado, se puede rotar con `logrotate`; el archivo está en
`~/apps/cmms/deploy/actualizar.log`.

## 6. Actualización manual y rollback

Actualización manual:

```bash
cd ~/apps/cmms
git pull --ff-only origin main
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion pull
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion up -d
```

Rollback de la imagen:

```bash
# 1. Busca el tag corto del commit bueno en GitHub Actions o en GHCR.
# 2. En .98:
nano .env.produccion
# IMAGE_TAG=sha-xxxxxxxx
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion pull
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion up -d
```

También puedes revertir el commit en GitHub:

```bash
git revert <commit>
git push origin main
```

El CI construye la versión anterior. **Ojo:** las migraciones de base de datos no se
revierten solas; para cambios de esquema, prueba primero en `cmms_pruebas` y ten un
respaldo de producción.

## 7. Respaldos

- Producción: respaldo diario a las 02:30, cifrado AES-256, retención 7 días.
- Carpeta: `/home/ub-admin/apps/cmms/respaldos/`.
- La clave es `BACKUP_PASSPHRASE` de `.env.produccion`. Guárdala fuera del servidor.
- El cron también respalda antes de una actualización si la imagen cambió.

Respaldo manual:

```bash
cd ~/apps/cmms
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion \
  exec respaldo bash scripts/respaldo.sh
```

La restauración está documentada en `docs/despliegue-98.md`.

## 8. Base de datos

| Ambiente | Base | Usuario |
|---|---|---|
| Producción | `cmms_produccion` | `cmms_prod` |
| Pruebas | `cmms_pruebas` | `cmms_test` |

Entrar a psql:

```bash
docker exec -it postgres_db psql -U postgres -d cmms_produccion
```

No tocar las bases `leviathan_db` ni `leviathan_migtest`, ni el contenedor
`postgres_db` fuera de lo necesario.

## 9. Nadie puede entrar a la app (restablecer el admin)

Si se olvidó la contraseña del `admin` (o de otro usuario) o quedó bloqueado, desde el servidor:

```bash
cd ~/apps/cmms
# Producción
docker compose -f docker-compose.prod.externo.yml --env-file .env.produccion exec app node dist/database/restablecer-acceso.js admin
# Pruebas
docker compose -f docker-compose.pruebas.externo.yml --env-file .env.pruebas exec app node dist/database/restablecer-acceso.js admin
```

Muestra una contraseña temporal (o un PIN, si el usuario es técnico u operario), quita el bloqueo por
intentos fallidos y obliga a cambiarla al ingresar. Queda en la bitácora como `ACCESO_RESTABLECIDO`.
Si el usuario no existe, muestra la lista de usuarios. No copies la temporal en chats.

## 10. Problemas comunes

- **Actions falla:** revisa la pestaña Actions. Si es por permisos de GHCR, verifica que
  el workflow tenga `packages: write` y que Actions esté habilitado en el repositorio.
- **El cron no actualiza:** mira `~/apps/cmms/deploy/actualizar.log`. Si dice
  `denied` o `unauthorized`, falta el `docker login ghcr.io` o el token venció.
- **La app no responde:** `docker compose ... logs app --tail 100` y
  `curl http://172.30.0.98:8088/api/salud`.
- **Migración fallida:** la app no arranca; revisa el log. Restaura el respaldo y
  vuelve a la imagen anterior con `IMAGE_TAG`.
- **Puerto ocupado:** producción usa 8088 y pruebas 8089; el 3000 pertenece a otra app.

## 11. Pendiente: HTTPS

La app está en HTTP. Funciona en la red de planta, pero sin HTTPS no hay PWA instalable,
modo sin conexión ni Web Push. Cuando se defina, se puede usar un certificado de la CA
de la empresa o ngrok con dominio estático.
