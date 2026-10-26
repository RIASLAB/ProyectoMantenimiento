# Imagen de producción del CMMS: la API y la app compilada en un solo servicio (puerto 3000).
# Se construye desde la raíz del repositorio:  docker compose -f docker-compose.prod.yml build

# 1) App (PWA)
FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# 2) API
FROM node:22-alpine AS backend
WORKDIR /src/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend/ ./
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# 3) Imagen final
FROM node:22-alpine
# Cliente de PostgreSQL y herramientas para los respaldos; tini para apagar limpio.
RUN apk add --no-cache bash coreutils findutils tar openssl postgresql16-client tzdata tini
ENV NODE_ENV=production \
    TZ=America/Bogota \
    PORT=3000 \
    FRONTEND_DIR=/app/frontend \
    UPLOADS_DIR=/datos/uploads
WORKDIR /app
COPY --from=backend /src/backend/package.json ./
COPY --from=backend /src/backend/node_modules ./node_modules
COPY --from=backend /src/backend/dist ./dist
COPY --from=frontend /src/frontend/dist ./frontend
COPY backend/scripts ./scripts
RUN chmod +x scripts/*.sh && mkdir -p /datos/uploads /respaldos && chown -R node:node /datos /respaldos
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1:3000/api/salud >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
# Aplica las migraciones pendientes y arranca la API.
CMD ["sh", "-c", "node dist/database/migrar.js && exec node dist/main.js"]
