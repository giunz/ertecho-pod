# Stage 1: Build SvelteKit app
# Uses plain node:22-alpine so we get a known Node version with all build tools
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime image using the HA base (Alpine + S6 overlay + bashio)
ARG BUILD_FROM=ghcr.io/hassio-addons/base:16.3.2
FROM $BUILD_FROM

# Install Node.js and npm; also python3/make/g++ for native better-sqlite3
RUN apk add --no-cache nodejs npm python3 make g++

WORKDIR /app

# Copy built SvelteKit app
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./

# Copy production node_modules — better-sqlite3 must be recompiled here
# so we reinstall only production deps on the target architecture
COPY package*.json ./
RUN npm ci --omit=dev

# Copy scripts and types (scraper uses tsx at runtime)
COPY scripts/ ./scripts/
COPY src/ ./src/

# S6 service definitions and run scripts
COPY rootfs/ /

# Ensure run scripts are executable
RUN chmod a+x \
  /etc/s6-overlay/s6-rc.d/web/run \
  /etc/s6-overlay/s6-rc.d/scraper/run

# S6 init is the entrypoint provided by the HA base image
CMD ["/init"]
