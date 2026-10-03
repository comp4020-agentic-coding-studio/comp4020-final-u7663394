# syntax = docker/dockerfile:1

# One Node process serves everything: the API, the live SSE streams, the built
# Vue client and README.md at /readme/. The server is TypeScript run directly
# by Node (type stripping), so only the client has a build step. The SQLite
# database lives at $DATA_DIR, which is the Fly volume (/data); migrations run
# when the server boots. Fixed by the course: serve HTTP on 0.0.0.0:$PORT, and
# fit in 256 MB. See doc/adr/0001-vue-node-sqlite-sse.md for why this stack.

FROM docker.io/library/node:24-slim AS base
RUN npm install -g pnpm@11.9.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# the Vue client, built to dist/
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# runtime dependencies only
FROM base AS deps
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM docker.io/library/node:24-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY package.json README.md ./
COPY server server
COPY shared shared
COPY doc doc
# headroom under the machine's 256 MB, so the GC works before the OOM killer does
CMD ["node", "--max-old-space-size=160", "server/main.ts"]
