# Align hosted mode (HOSTED=1) on one machine with a persistent volume. See docs/HOSTING.md.
# Secrets come from the platform (fly secrets), never from this file or a file in the image.
# The build context is an allowlist (.dockerignore): only the app's own source goes in. Scripts, tests, docs, the
# local agent packages and any .env file never reach the runtime, except the assembled operator command,
# three core modules and qualified settings closure needed by `fly ssh console`. The trust documents
# (docs/trust, docs/RETENTION.md) enter the build
# stage only. The native cache, independent verifiers and build adapter also enter
# the build stage only, so the image checks the exact qualified packages itself.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY app ./app
COPY lib ./lib
COPY public ./public
COPY proxy.ts instrumentation.ts next.config.ts tsconfig.json ./
# The public /privacy and /trust pages are built from these (lib/trust/docs.ts); the runtime stage doesn't copy them.
COPY docs/trust ./docs/trust
COPY docs/RETENTION.md ./docs/RETENTION.md
# Prepared from the exact admitted native caches by npm run prepare:container.
# Verification and independent acceptance run again inside this clean build stage.
COPY .native-inputs /
COPY native ./native
COPY scripts/native-libraries.mjs ./scripts/native-libraries.mjs
COPY scripts/align-admin-main.mjs scripts/prepare-operator.mjs ./scripts/
RUN chown -R node:node /app
USER node
RUN node scripts/native-libraries.mjs web && node scripts/prepare-operator.mjs /app/.operator-runtime && npx next build

# Runtime: production dependencies, build output and reviewed runtime data, run as the node user.
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOSTED=1 ALIGN_DATA_DIR=/data PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.next ./.next
# Preserve exact reviewed runtime data beside the bundled application output.
# Root ownership keeps the runtime data read-only for the node application user.
COPY --from=build --chown=0:0 /app/lib/native/server_workspace_admission/disposable-domains.json ./qualified-assets/server_workspace_admission/disposable-domains.json
COPY --from=build --chown=0:0 /app/lib/native/server_sample/sample-text.json ./qualified-assets/server_sample/sample-text.json
COPY --from=build /app/public ./public
COPY next.config.ts ./
# The exact assembled Node-only operator closure, with no cache, verifier or build adapter.
COPY --from=build /app/.operator-runtime ./
RUN mkdir -p /data && chown -R node:node /data /app/.next
EXPOSE 8080
# Fly mounts the volume over /data owned by root, so the container starts as root only to hand /data to the node
# user; setpriv then execs the server in place as node, so it is PID 1 itself (no npx, shell or root parent).
# Fly's proxy terminates TLS and connects over the machine's private interface, so bind all interfaces here;
# proxy.ts answers only for ALIGN_HOSTS, forwarded https and requests that came through Fly's edge.
CMD ["sh", "-c", "chown -R node:node /data && exec setpriv --reuid=node --regid=node --init-groups node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 8080"]
