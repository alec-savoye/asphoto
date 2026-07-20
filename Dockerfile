FROM node:22-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server ./server
COPY public ./public

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server/index.js"]
