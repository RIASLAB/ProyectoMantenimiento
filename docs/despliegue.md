# Despliegue en producción y respaldos

Guía para el equipo de sistemas (NFR-01, NFR-03). El servidor (propio o en la nube) sigue pendiente de decisión (D-12); el procedimiento es el mismo en los dos casos.

## 1. Qué se instala

```
Celulares / PC ──HTTPS──▶ Caddy (certificado automático) ──▶ app: API + app compilada (Node 22, puerto 3000)
                                                              │
                                                              ├──▶ db: PostgreSQL 16 (sin puertos publicados)
                                                              └──▶ volumen de archivos (manuales, fotos)
                          respaldo: copia cifrada diaria de la base y los archivos ──▶ carpeta ./respaldos (+ NAS)
```

Todo está en `docker-compose.prod.yml`: cuatro servicios (`db`, `app`, `respaldo`, `caddy`). La app y la API son un solo servicio, en un solo dominio. Las migraciones de base de datos se aplican solas cada vez que arranca la app.

## 2. Requisitos del servidor

| | Mínimo | Recomendado |
|---|---|---|
| Sistema | Linux con Docker Engine 24+ y Docker Compose v2 (ej. Ubuntu Server 24.04) | — |
| CPU / RAM | 2 vCPU / 4 GB | 4 vCPU / 8 GB |
| Disco | 40 GB | 100 GB SSD + un segundo disco o NAS para los respaldos |
| Red | Puertos 80 y 443 abiertos hacia el servidor | IP fija y un nombre de dominio |

**HTTPS es obligatorio**: sin él, la app no se instala en el celular, no funciona sin conexión y no recibe avisos. Hay dos formas de obtenerlo:

- **Servidor con salida a internet** (nube o servidor propio publicado): Caddy obtiene y renueva solo el certificado de Let's Encrypt. Solo hay que apuntar el dominio (ej. `cmms.nutrialimentos.com.co`) a la IP del servidor.
- **Servidor solo en la red interna**: Let's Encrypt no puede validar el dominio. Use el certificado de la empresa: copie `certificado.pem` y `clave.pem` a `docker/` y en `docker/Caddyfile` agregue la línea `tls /etc/caddy/certificado.pem /etc/caddy/clave.pem`, montando esos archivos en el servicio `caddy`. Los celulares deben confiar en ese certificado.

## 3. Primera instalación

```bash
# 1. Código
git clone https://github.com/RIASLAB/ProyectoMantenimiento.git cmms && cd cmms

# 2. Configuración (NO se sube a git)
cp .env.produccion.example .env.produccion
openssl rand -hex 32     # ejecútelo tres veces: DB_PASSWORD, JWT_SECRET y BACKUP_PASSPHRASE
nano .env.produccion     # DOMINIO y las tres claves
mkdir -p respaldos

# 3. Construir y arrancar
docker compose -f docker-compose.prod.yml --env-file .env.produccion up -d --build

# 4. Crear el administrador (una sola vez). Muestra la contraseña si no se define SEED_ADMIN_PASSWORD.
docker compose -f docker-compose.prod.yml --env-file .env.produccion run --rm app node dist/database/seed.js

# 5. Comprobar
docker compose -f docker-compose.prod.yml --env-file .env.produccion ps
curl https://<DOMINIO>/api/salud          # {"estado":"ok"}
```

Después: entrar con `admin`, cambiar la contraseña, crear los usuarios, definir el autorizador y la tarifa en **Ajustes**, y cargar máquinas y repuestos en **Ajustes → Carga masiva desde Excel**.

> **Guarde `BACKUP_PASSPHRASE` fuera del servidor** (gestor de contraseñas de sistemas). Sin esa clave los respaldos no se pueden abrir.

Avisos al celular (opcional): genere las claves con
`docker compose -f docker-compose.prod.yml --env-file .env.produccion run --rm app npx web-push generate-vapid-keys`,
cópielas en `.env.produccion` y repita el paso 3. No las cambie después: cada celular tendría que volver a activar los avisos.

## 4. Actualizar a una versión nueva

```bash
cd cmms
git pull
docker compose -f docker-compose.prod.yml --env-file .env.produccion up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.produccion logs app --tail 20   # "Migraciones aplicadas…" o "Base de datos al día"
```

Antes de una actualización importante, haga un respaldo manual (sección 5). Los celulares reciben la versión nueva solos la próxima vez que abran la app con señal; lo que tengan pendiente sin conexión se conserva y se envía.

## 5. Respaldos (NFR-01)

El servicio `respaldo` hace cada día, a la hora `RESPALDO_HORA` (02:30 por defecto):

1. Volcado de la base (`pg_dump`, formato comprimido) y verificación de que se puede leer.
2. Copia de todos los archivos adjuntos (manuales, documentos, fotos de OT).
3. Conteo de registros de cada tabla y sumas de verificación (SHA-256).
4. Todo en un archivo `cmms-AAAAMMDD-HHMMSS.tar.enc` **cifrado con AES-256**, en `./respaldos` (y en `BACKUP_COPIA_DIR` si se monta un NAS).
5. Borra los respaldos con más de `RETENCION_DIAS` días (30 por defecto), nunca el más reciente.

Si falla, lo reintenta una hora después. Para revisar:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.produccion logs respaldo --tail 30
ls -lh respaldos/
```

**Respaldo manual** (antes de actualizar, por ejemplo):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.produccion exec respaldo bash scripts/respaldo.sh
```

**Copia fuera del servidor**: un respaldo en el mismo disco no protege contra la pérdida del servidor. Monte un NAS o disco externo en el servicio `respaldo` (ej. `- /mnt/nas/cmms:/copia`) y defina `BACKUP_COPIA_DIR=/copia`, o sincronice `./respaldos` a otro equipo cada día.

### Restaurar

Se restaura primero en una **base nueva**, se comprueba y luego se cambia. El script descifra, comprueba las sumas de verificación, restaura base y archivos, y compara el conteo de cada tabla con el del momento del respaldo.

```bash
C="docker compose -f docker-compose.prod.yml --env-file .env.produccion"
$C exec db createdb -U cmms cmms_restaurada
$C run --rm --user 0 -v "$PWD/respaldos:/respaldos" -v "$PWD/restaurado:/restaurado" \
  -e DESTINO_DATABASE_URL="postgres://cmms:<DB_PASSWORD>@db:5432/cmms_restaurada" \
  -e DESTINO_UPLOADS_DIR=/restaurado/uploads \
  -e BACKUP_PASSPHRASE="<clave>" \
  respaldo bash scripts/restaurar.sh /respaldos/cmms-AAAAMMDD-HHMMSS.tar.enc
# → "Restauración correcta: 22 tablas y N archivos coinciden con el respaldo"
```

Para dejar la restaurada como principal (pérdida del servidor o daño de la base): detenga `app`, restaure directamente sobre `cmms` con `--si` al final del comando (reemplaza su contenido) y copie `restaurado/uploads` al volumen `cmms-uploads`; luego arranque `app`.

### Prueba de restauración antes de salir a producción (obligatoria)

| Paso | Resultado esperado | Hecho |
|---|---|---|
| Cargar datos reales (máquinas, repuestos) y trabajar un día | — | ☐ |
| Respaldo manual | `Respaldo listo: …tar.enc` | ☐ |
| Restaurar en `cmms_restaurada` | `Restauración correcta…` | ☐ |
| Levantar una app de prueba apuntando a la restaurada y abrir 3 máquinas con sus documentos | Datos y PDF iguales | ☐ |
| Repetir con el respaldo copiado al NAS, desde otro equipo | Igual | ☐ |
| Anotar fecha, responsable y duración de la restauración | — | ☐ |

Esta prueba se hizo en el entorno de desarrollo (respaldo cifrado → base nueva → conteos, app y documentos idénticos; clave equivocada, archivo dañado y base con datos detectados). Debe repetirse en el servidor definitivo.

## 6. Sin Docker (alternativa)

Si sistemas prefiere instalar los componentes directamente (Windows Server o Linux):

1. PostgreSQL 16 y Node.js 22.
2. `cd frontend && npm ci && npm run build`; `cd backend && npm ci && npm run build`.
3. Variables de entorno de `backend/.env.example` más `NODE_ENV=production`, `FRONTEND_DIR=../frontend/dist` y una `JWT_SECRET` aleatoria.
4. `node dist/database/migrar.js`, luego `node dist/database/seed.js` (solo la primera vez) y `node dist/main.js` como servicio (systemd en Linux; NSSM o el Programador de tareas en Windows).
5. Un proxy inverso con HTTPS hacia el puerto 3000 (IIS con URL Rewrite, Nginx o Caddy).
6. `backend/scripts/respaldo.sh` todos los días con cron (Linux) o el Programador de tareas con Git Bash o WSL (Windows); requiere `pg_dump`, `psql` y `openssl`.

## 7. Monitoreo y problemas comunes

- `GET /api/salud` responde `{"estado":"ok"}`: úselo en el monitoreo de sistemas.
- `docker compose … logs app` muestra errores de la API; `logs caddy`, los del certificado.
- **"JWT_SECRET debe ser un valor aleatorio de al menos 32 caracteres"**: la app no arranca en producción con una clave débil; genere una con `openssl rand -hex 32`.
- **El certificado no se emite**: el dominio no apunta al servidor o los puertos 80/443 no están abiertos (ver sección 2).
- **Un celular no ve los cambios**: cerrar y abrir la app con señal; la versión nueva se instala sola.
