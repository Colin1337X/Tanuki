FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS production
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 TANUKI_DATA_DIR=/app/data
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node installer ./installer
RUN mkdir /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]

# CI-only tools; never included in the production target.
FROM production AS validation
USER root
RUN apt-get update && apt-get install -y --no-install-recommends openssl iproute2 && rm -rf /var/lib/apt/lists/*
USER node
CMD ["node", "--test", "scripts/production-smoke.test.js"]

# Default docker build remains the shipping image, not the validation harness.
FROM production AS release
