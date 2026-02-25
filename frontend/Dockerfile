FROM node:20-slim

WORKDIR /frontend

COPY package*.json ./
RUN npm ci

COPY . .

# Production build: no eval() in webpack bundles, middleware works in Edge Runtime
ENV NODE_ENV=production
RUN npx next build

EXPOSE 3000

CMD ["npx", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
