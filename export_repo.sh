#!/bin/bash

# Export entire repository contents to console
# Usage: ./export_repo.sh

echo "=== DISCOURSE AI ASSISTANT REPOSITORY EXPORT ==="
echo "Generated: $(date)"
echo "Repository: $(pwd)"
echo ""

# Function to print file contents with header
print_file() {
    local file="$1"
    echo ""
    echo "=========================================="
    echo "FILE: $file"
    echo "=========================================="
    if [ -f "$file" ]; then
        cat "$file"
    else
        echo "[FILE NOT FOUND]"
    fi
    echo ""
}

# Export all important files
echo "=== PACKAGE CONFIGURATIONS ==="
print_file "package.json"
print_file "turbo.json"
print_file "tsconfig.json"
print_file ".env"
print_file "env.example"

echo "=== CORE PACKAGE ==="
print_file "packages/core/package.json"
print_file "packages/core/tsconfig.json"
print_file "packages/core/src/types.ts"
print_file "packages/core/src/logger.ts"

echo "=== DISCORD BOT ==="
print_file "apps/discord-bot/package.json"
print_file "apps/discord-bot/tsconfig.json"
print_file "apps/discord-bot/polyfills.preload.js"
print_file "apps/discord-bot/src/index.ts"

echo "=== AGENT SERVICE ==="
print_file "apps/agent-service/package.json"
print_file "apps/agent-service/tsconfig.json"
print_file "apps/agent-service/src/index.ts"
print_file "apps/agent-service/src/database/connection.ts"
print_file "apps/agent-service/src/database/schema.ts"
print_file "apps/agent-service/src/database/migrations.ts"
print_file "apps/agent-service/src/routes/runs.ts"
print_file "apps/agent-service/src/services/openai-service.ts"
print_file "apps/agent-service/src/services/mcp-client.ts"
print_file "apps/agent-service/src/services/discord-service.ts"

echo "=== MCP HTTP SERVICE ==="
print_file "services/mcp/mcp-http/package.json"
print_file "services/mcp/mcp-http/tsconfig.json"
print_file "services/mcp/mcp-http/src/index.ts"

echo "=== DOCKER CONFIGURATION ==="
print_file "infra/compose/docker-compose.dev.yml"
print_file "infra/compose/docker-compose.prod.yml"

echo "=== DOCUMENTATION ==="
print_file "README.md"
print_file "DISCORD_BOT_DEBUG.md"

echo "=== REPOSITORY STRUCTURE ==="
echo ""
echo "=========================================="
echo "DIRECTORY STRUCTURE"
echo "=========================================="
find . -type f -name "*.ts" -o -name "*.js" -o -name "*.json" -o -name "*.yml" -o -name "*.yaml" -o -name "*.md" -o -name "*.sh" -o -name ".env*" | grep -v node_modules | sort

echo ""
echo "=== EXPORT COMPLETE ==="
echo "Total files exported: $(find . -type f -name "*.ts" -o -name "*.js" -o -name "*.json" -o -name "*.yml" -o -name "*.yaml" -o -name "*.md" -o -name "*.sh" -o -name ".env*" | grep -v node_modules | wc -l)"
echo "Generated: $(date)"
