# DRAFT (LIM-2424, not applied): Align hosted tester mode (HOSTED=1) on one machine with a persistent volume.
# See docs/HOSTING.md. Secrets come from the platform (fly secrets), never from this file or a file in the image.
# The build context is an allowlist (.dockerignore): only the app's own source goes in. Northstar's fixture, the
# Sparta evidence, the agent and test scripts, and any .env file never reach the image.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY proxy.ts instrumentation.ts next.config.ts tsconfig.json ./
RUN npx next build

# Runtime: production dependencies and the build output only, run as the unprivileged node user.
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOSTED=1 ALIGN_DATA_DIR=/data PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY next.config.ts ./
COPY scripts/ws-admin.mjs ./scripts/ws-admin.mjs
RUN mkdir -p /data && chown -R node:node /data /app/.next
EXPOSE 8080
# Fly mounts the volume over /data owned by root, so the container starts as root only to hand /data to the node
# user; setpriv then execs the server in place as node, so it is PID 1 itself (no npx, shell or root parent).
# Fly's proxy terminates TLS and connects over the machine's private interface, so bind all interfaces here;
# proxy.ts answers only for ALIGN_HOSTS, forwarded https and requests that came through Fly's edge.
CMD ["sh", "-c", "chown -R node:node /data && exec setpriv --reuid=node --regid=node --init-groups node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 8080"]
