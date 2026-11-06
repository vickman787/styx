FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node server ./server
COPY --chown=node:node lib ./lib
COPY --chown=node:node fixtures ./fixtures
COPY --chown=node:node dist ./dist
COPY --chown=node:node scripts ./scripts
USER node
CMD ["node", "--import", "tsx", "scripts/start-vps.ts"]
