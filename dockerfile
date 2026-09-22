# ==============================================================================
# Dockerfile Raiz Multi-Target para UniFACENS-Map Monorepo (Node.js 24 LTS)
# Suporta compilação e execução tanto da API quanto do Client Expo
#
# Exemplos de uso direto:
#   docker build -f dockerfile --target api-dev -t unifacens-api:dev .
#   docker build -f dockerfile --target api-prod -t unifacens-api:prod .
#   docker build -f dockerfile --target client-dev -t unifacens-client:dev .
#   docker build -f dockerfile --target client-prod -t unifacens-client:prod .
# ==============================================================================

# ------------------------------------------------------------------------------
# Base comum (Debian Bookworm Slim com Node 24 LTS)
# ------------------------------------------------------------------------------
FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates libglib2.0-0 libnss3 libnspr4 && rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------------------------
# Dependências de todo o Monorepo
# ------------------------------------------------------------------------------
FROM base AS dependencies
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY unifacens-api/package.json ./unifacens-api/
COPY unifacens-client/package.json ./unifacens-client/
RUN npm ci

# ------------------------------------------------------------------------------
# TARGET: API - Desenvolvimento
# ------------------------------------------------------------------------------
FROM dependencies AS api-dev
ENV NODE_ENV=development
WORKDIR /app
COPY packages/shared ./packages/shared
COPY unifacens-api ./unifacens-api
EXPOSE 8000
CMD ["npm", "--workspace=unifacens-api", "run", "start:dev"]

# ------------------------------------------------------------------------------
# TARGET: API - Build de Produção
# ------------------------------------------------------------------------------
FROM dependencies AS api-builder
ENV NODE_ENV=production
WORKDIR /app
COPY packages/shared ./packages/shared
COPY unifacens-api ./unifacens-api
RUN npm --workspace=unifacens-api run build

# ------------------------------------------------------------------------------
# TARGET: API - Runner de Produção
# ------------------------------------------------------------------------------
FROM base AS api-prod
ENV NODE_ENV=production
WORKDIR /app
USER node
COPY --chown=node:node --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=dependencies /app/unifacens-api/node_modules ./unifacens-api/node_modules
COPY --chown=node:node --from=dependencies /app/package.json ./package.json
COPY --chown=node:node --from=api-builder /app/packages/shared ./packages/shared
COPY --chown=node:node --from=api-builder /app/unifacens-api/dist ./unifacens-api/dist
COPY --chown=node:node --from=api-builder /app/unifacens-api/package.json ./unifacens-api/package.json
EXPOSE 8000
WORKDIR /app/unifacens-api
CMD ["node", "dist/main.js"]

# ------------------------------------------------------------------------------
# TARGET: Client - Desenvolvimento (Metro / Expo Web)
# ------------------------------------------------------------------------------
FROM dependencies AS client-dev
ENV NODE_ENV=development
WORKDIR /app
COPY packages/shared ./packages/shared
COPY unifacens-client ./unifacens-client
EXPOSE 8081
WORKDIR /app/unifacens-client
CMD ["npx", "expo", "start", "--port", "8081", "--offline"]

# ------------------------------------------------------------------------------
# TARGET: Client - Build estático Web
# ------------------------------------------------------------------------------
FROM dependencies AS client-builder
ENV NODE_ENV=production
WORKDIR /app
COPY packages/shared ./packages/shared
COPY unifacens-client ./unifacens-client
RUN npx --workspace=unifacens-client expo export --platform web

# ------------------------------------------------------------------------------
# TARGET: Client - Runner de Produção (Nginx)
# ------------------------------------------------------------------------------
FROM nginx:alpine AS client-prod
COPY unifacens-client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=client-builder /app/unifacens-client/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
