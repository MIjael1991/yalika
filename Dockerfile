FROM node:22.20.0-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY apps/api/package.json apps/api/package-lock.json ./apps/api/
COPY apps/web/package.json apps/web/package-lock.json ./apps/web/

RUN npm ci --prefix apps/api
RUN npm ci --prefix apps/web

COPY apps/api ./apps/api
COPY apps/web ./apps/web
COPY infrastructure ./infrastructure
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DATABASE_URL=${DATABASE_URL}
RUN cd apps/api && npx prisma generate && npm run build
RUN cd apps/web && npm run build

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "infrastructure/render/start-platform.mjs"]
