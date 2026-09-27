FROM node:20-alpine

WORKDIR /app

COPY server/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY server/src ./src

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "src/index.js"]
