FROM node:22-bookworm-slim AS build
ARG APP_VERSION=dev
# L'interface connaît sa version : elle se recharge seule si le serveur en annonce une autre.
ENV VITE_APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY server/ server/
COPY web/ web/
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ARG APP_VERSION=dev
# tzdata explicite : sans zoneinfo, la variable TZ (ex. Europe/Paris) est ignorée.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3110 APP_VERSION=${APP_VERSION}
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
# UID 1000 (utilisateur node) : le dossier monté sur /data doit lui appartenir.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3110
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
