FROM node:20-bookworm

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p /app/data \
    && ln -sf /app/data/redirectiq.db /app/redirectiq.db \
    && ln -sf /app/data/redirectiq.db-wal /app/redirectiq.db-wal \
    && ln -sf /app/data/redirectiq.db-shm /app/redirectiq.db-shm

EXPOSE 3001

CMD ["npm", "start"]
