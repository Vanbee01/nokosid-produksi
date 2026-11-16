FROM node:20-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
# build tools hanya sebagai cadangan bila binary prebuilt better-sqlite3 tidak tersedia
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && npm install --omit=dev \
 && apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
COPY . .
RUN mkdir -p /app/data && chown -R node:node /app
ENV DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "server.js"]
