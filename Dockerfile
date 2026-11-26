ARG BUILD_FROM=ghcr.io/home-assistant/base:latest
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
COPY public ./public
RUN npx tsc && npm prune --omit=dev
COPY run.sh /run.sh
RUN chmod +x /run.sh
CMD ["/run.sh"]
