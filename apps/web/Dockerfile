FROM node:22-bookworm-slim AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace=@reading-tracker/web --include-workspace-root=false
COPY tsconfig.base.json ./
COPY apps/web ./apps/web
RUN npm run build --workspace=@reading-tracker/web

FROM nginx:stable-alpine AS runtime
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx/default.conf.template /opt/nginx/default.conf.template
COPY deploy/nginx/10-render-domain.sh /docker-entrypoint.d/10-render-domain.sh
RUN chmod +x /docker-entrypoint.d/10-render-domain.sh
EXPOSE 80 443
