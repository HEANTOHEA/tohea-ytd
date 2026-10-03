# Production Dockerfile for YouTube Music Downloader
FROM node:20-bookworm-slim

# Install system dependencies (FFmpeg, Python3, python3-pip, curl, ca-certificates)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install the latest standalone yt-dlp binary AND install yt-dlp python package
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && (pip3 install --no-cache-dir --break-system-packages yt-dlp || true)

# Set working directory
WORKDIR /app

# Copy dependency specifications and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application files
COPY . .

# Set environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Cloud platforms like Render / Railway / Cloud Run supply dynamic $PORT
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Start server
CMD ["npm", "start"]
