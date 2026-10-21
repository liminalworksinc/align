# DRAFT (LIM-2424 L0, not applied): Align hosted tester mode (HOSTED=1) on one machine with a persistent volume.
# See docs/HOSTING.md. Secrets come from the platform (fly secrets), never from this file or an .env in the image.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx next build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOSTED=1 ALIGN_DATA_DIR=/data PORT=8080
COPY --from=build /app ./
EXPOSE 8080
# The platform proxy terminates TLS and connects over the machine's private interface, so bind all interfaces here;
# proxy.ts answers only for ALIGN_HOSTS and only for forwarded https.
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "8080"]
