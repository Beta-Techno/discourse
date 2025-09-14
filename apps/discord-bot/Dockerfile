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
RUN adduser -S discord-bot -u 1001

# Change ownership of the app directory
RUN chown -R discord-bot:nodejs /app
USER discord-bot

EXPOSE 3000

CMD ["npm", "start"]
