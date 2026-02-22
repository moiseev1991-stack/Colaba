FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Debug: check what was generated
RUN echo "=== Checking build output ===" && \
    ls -la .next/ && \
    ls -la .next/server/ 2>/dev/null || true && \
    cat .next/server/app/index.html 2>/dev/null | head -c 500 || true


FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.js ./next.config.js

EXPOSE 3000

CMD ["npm", "run", "start"]

