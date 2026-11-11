# Rilis — production image (Hugging Face Spaces / any Docker host)
FROM node:24-bookworm-slim

# Toolchain so better-sqlite3 can fall back to node-gyp if its bundled
# Linux prebuild is not used; --ignore-scripts is NOT used here, the
# install runs the package's normal (prebuild-or-build) path.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=7860
ENV HOSTNAME=0.0.0.0
# Ephemeral container filesystem: SQLite re-seeds on restart (by design).
ENV RILIS_DB_PATH=/app/data/rilis.db

EXPOSE 7860
CMD ["npm", "start"]
