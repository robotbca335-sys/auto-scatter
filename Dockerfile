FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3847
ENV PORT=3847
ENV HEADLESS=true

CMD ["npm", "start"]
