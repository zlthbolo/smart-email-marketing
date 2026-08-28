FROM node:22-alpine AS web-build
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
ENV VITE_API_BASE_URL=/v1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --omit=dev
COPY apps/api/src ./src
COPY apps/api/migrations ./migrations
COPY --from=web-build /web/dist ./public

ENV NODE_ENV=production
ENV API_PORT=8080
ENV WEB_DIST_DIR=/app/public
EXPOSE 8080

# production.mjs migrates the schema, bootstraps the owner idempotently, and
# supervises both the HTTP server and PostgreSQL-backed delivery worker.
CMD ["node", "src/production.mjs"]
