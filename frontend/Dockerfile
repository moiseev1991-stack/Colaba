FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

# Development mode - works correctly
CMD ["npm", "run", "dev"]

