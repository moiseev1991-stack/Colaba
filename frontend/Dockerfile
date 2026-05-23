# Build arguments for version tracking
ARG APP_VERSION=0.0.0-dev
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown

FROM node:20-slim AS builder

# Re-declare args in builder stage
ARG APP_VERSION
ARG GIT_SHA
ARG BUILD_TIME

WORKDIR /frontend

COPY package*.json ./
# --prefer-offline: использует кэш npm если он есть (быстрее при rebuild)
# --no-audit --no-fund: не делает audit-запрос и не печатает funding-сообщения
# (экономит сетевые запросы и время; Coolify-сборка на сервере без BuildKit падала
#  на длинном npm ci с exit 255 — типичный таймаут/OOM на слабых VPS).
RUN npm ci --prefer-offline --no-audit --no-fund

COPY . .

# Production build: no eval() in webpack bundles, middleware works in Edge Runtime
ENV NODE_ENV=production
ENV APP_VERSION=$APP_VERSION
ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIME=$BUILD_TIME

RUN npx next build

EXPOSE 3000

# entrypoint resolves backend hostname to IP once (in a fresh node process,
# where Docker DNS works reliably) and sets INTERNAL_BACKEND_ORIGIN to the IP.
# This avoids DNS resolution inside the long-running Next.js process.
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r//' /entrypoint.sh && chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["npx", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
