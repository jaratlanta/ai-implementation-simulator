# Multi-stage build: Vite frontend + Express backend
FROM node:20-alpine AS base

# Stage 1: Build frontend
FROM base AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build -- --outDir dist/client

# Stage 2: Build backend
FROM base AS backend-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --production=false
COPY server/ .
RUN npx tsc

# Stage 3: Production
FROM base AS production
WORKDIR /app

# Copy backend
COPY server/package*.json ./server/
RUN cd server && npm ci --production
COPY --from=backend-build /app/server/dist ./server/dist

# Copy frontend build
COPY --from=frontend-build /app/dist/client ./dist/client

# Copy content files for RAG
COPY content/ ./content/

# Copy brand assets
COPY public/brand/ ./dist/client/brand/

# Server serves both API and static frontend
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/dist/index.js"]
