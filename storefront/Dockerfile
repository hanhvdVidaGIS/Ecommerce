# Storefront (Next.js 16, đầu ra standalone). Build context: thư mục storefront/
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Địa chỉ API dùng cho rewrites (được ghi cố định lúc build). Trong mạng compose, API nằm ở http://api:8080
ARG API_URL=http://api:8080
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
RUN addgroup -S web && adduser -S web -G web && chown -R web:web /app
USER web
EXPOSE 3000
CMD ["node", "server.js"]
