FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY migrations ./migrations
EXPOSE 3001
CMD ["sh", "-c", "node src/migrate.mjs && node src/server.mjs"]
