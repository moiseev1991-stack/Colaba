FROM node:20-slim

WORKDIR /frontend

COPY package*.json ./
RUN npm ci

COPY . .

# Production build: no eval() in webpack bundles, middleware works in Edge Runtime
ENV NODE_ENV=production
RUN npx next build

EXPOSE 3000

# entrypoint resolves backend hostname to IP once (in a fresh node process,
# where Docker DNS works reliably) and sets INTERNAL_BACKEND_ORIGIN to the IP.
# This avoids DNS resolution inside the long-running Next.js process.
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["npx", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
