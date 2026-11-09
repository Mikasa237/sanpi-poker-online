FROM node:22-alpine

WORKDIR /app

COPY outputs/package.json outputs/package-lock.json ./
RUN npm ci --omit=dev

COPY outputs ./

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
