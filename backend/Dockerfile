FROM node:24-alpine
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
EXPOSE 3000
CMD ["npx", "tsx", "src/server.ts"]