FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
COPY migrations ./migrations

CMD ["node", "src/server.js"]
