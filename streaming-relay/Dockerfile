# ─── Native Stream Relay — Dockerfile ────────────────────────────────────────
FROM node:22-bookworm-slim

# Install FFmpeg
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Confirm FFmpeg is available and supports RTMPS (TLS)
RUN ffmpeg -version 2>&1 | head -1 && \
    ffmpeg -protocols 2>&1 | grep -i rtmps || echo "WARNING: rtmps protocol not found in ffmpeg build"

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json* ./
RUN npm install --production --no-audit --no-fund

# Copy source
COPY server.js ./

ENV PORT=8080
ENV NODE_ENV=production

# Cloud Run health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/health', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

EXPOSE 8080

CMD ["node", "server.js"]
