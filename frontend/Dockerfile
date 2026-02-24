FROM node:20-slim

WORKDIR /frontend

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

# Dev mode avoids production hydration bug
ENV NODE_ENV=development
CMD ["npx", "next", "dev", "-p", "3000", "-H", "0.0.0.0"]
