# Web Terminal — multi-stage build
# Uses MCR base images per the Liliput deploy contract (avoid Docker Hub rate-limits).

FROM mcr.microsoft.com/azurelinux/base/nodejs:20 AS build
WORKDIR /src

# Install build essentials for any native deps (node-pty optional).
RUN tdnf install -y --refresh build-essential python3 ca-certificates && tdnf clean all || true

# Copy only what we need
COPY web/app/package.json web/app/tsconfig.json ./web/app/
COPY web/app/scripts ./web/app/scripts
COPY web/app/public ./web/app/public
COPY web/app/src ./web/app/src

COPY web/server/package.json ./web/server/
COPY web/server/src ./web/server/src

# Install app build deps and build static bundle
WORKDIR /src/web/app
RUN npm install --no-audit --no-fund --loglevel=error
RUN node scripts/build.mjs

# Install server runtime deps (node-pty optional — tolerate failure)
WORKDIR /src/web/server
RUN npm install --no-audit --no-fund --loglevel=error --omit=optional \
    && (npm install --no-audit --no-fund --loglevel=error node-pty || echo "node-pty unavailable — fallback will be used")

# ──────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/azurelinux/base/nodejs:20 AS runtime
WORKDIR /app

# Make sure /bin/bash exists (azurelinux uses bash by default).
RUN test -x /bin/bash || (tdnf install -y bash && tdnf clean all)

COPY --from=build /src/web/app/dist ./web/app/dist
COPY --from=build /src/web/app/package.json ./web/app/package.json
COPY --from=build /src/web/server ./web/server

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

WORKDIR /app/web/server
CMD ["node", "src/index.mjs"]
