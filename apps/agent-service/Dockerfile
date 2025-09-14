FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY ../../packages/core/package.json ../../packages/core/
COPY ../../package.json ../../

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .
COPY ../../packages/core ../../packages/core

# Build the application
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S agent-service -u 1001

# Change ownership of the app directory
RUN chown -R agent-service:nodejs /app
USER agent-service

EXPOSE 8080

CMD ["npm", "start"]
