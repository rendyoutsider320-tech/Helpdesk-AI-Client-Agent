# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* yarn.lock* ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Ensure public directory exists
RUN mkdir -p public

# Build Next.js app
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install only production dependencies and curl for healthchecks
RUN apk add --no-cache curl && npm install -g next

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

EXPOSE 3002

ENV NODE_ENV=production
ENV PORT=3002

CMD ["npm", "start"]
