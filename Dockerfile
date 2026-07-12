# Kuran'a Sor — üretim imajı
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

# Sıkıştırılmış veritabanını imaj build anında aç (ilk açılışı hızlandırır).
# DATA_DIR ortam değişkeni ayarlanırsa (kalıcı disk), sunucu ilk çalıştığında
# orada veritabanı yoksa yine otomatik açar — bu adım yalnızca bir hızlandırma.
RUN node -e "require('zlib');const fs=require('fs');const zlib=require('zlib');fs.writeFileSync('data/kuranasor.db', zlib.gunzipSync(fs.readFileSync('data/kuranasor.db.gz')));"

ENV NODE_ENV=production
EXPOSE 4600

CMD ["node", "server.js"]
