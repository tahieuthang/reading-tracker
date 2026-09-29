FROM node:22-bookworm-slim AS api-base
RUN apt-get update \
    && apt-get install --no-install-recommends -y openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace

FROM api-base AS dependencies
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace=@reading-tracker/api --include-workspace-root=false

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
RUN DATABASE_URL=mysql://reader:build-only@127.0.0.1:3306/reading_tracker npm run db:generate --workspace=@reading-tracker/api
RUN npm run build --workspace=@reading-tracker/api

FROM build AS migrator
ENV NODE_ENV=production
CMD ["npm", "run", "db:migrate:deploy", "--workspace=@reading-tracker/api"]

FROM api-base AS production-dependencies
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace=@reading-tracker/api --include-workspace-root=false --ignore-scripts

FROM api-base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV PM2_HOME=/tmp/pm2
COPY --from=production-dependencies /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
EXPOSE 3000
USER node
CMD ["./node_modules/.bin/pm2-runtime", "apps/api/dist/src/server.js", "--name", "reading-tracker-api"]
