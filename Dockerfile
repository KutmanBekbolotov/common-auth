FROM node:22-bookworm-slim AS base

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm run prisma:generate

FROM base AS dev

WORKDIR /app
ENV NODE_ENV=development

COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .

USER node

EXPOSE 3000

CMD ["sh", "./docker-entrypoint.dev.sh"]

FROM base AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run prisma:generate
RUN npm run build
RUN npm prune --omit=dev

FROM base AS prod

WORKDIR /app
ENV NODE_ENV=production

COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/prisma ./prisma
COPY --chown=node:node --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --chown=node:node package*.json ./

USER node

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
