FROM node:22.23.4-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY certs/shared-postgres-ca.crt /etc/ssl/certs/gag-shared-postgres-ca.crt
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npm ci
COPY . .
RUN npm run db:generate
RUN GAG_VPS_RUNTIME=true npm run build

FROM build AS runner
ENV NODE_ENV=production \
    APP_DEPLOYMENT_ENV=production \
    ASTRO_NODE_AUTOSTART=enabled \
    HOST=0.0.0.0 \
    PORT=4371
EXPOSE 4371
CMD ["node", "dist/server/entry.mjs"]
