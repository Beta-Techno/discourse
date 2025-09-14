# Discourse AI - Discord-Native Company Assistant

A secure, company-aware AI assistant that lives in Discord, powered by OpenAI and MCP (Model Context Protocol) for tool integration.

## 🎯 Overview

Discourse AI is designed to be a Discord-native assistant that can:
- Answer questions and provide information
- Safely browse allowlisted websites
- Create organized conversation threads
- Maintain full audit logs of all interactions
- Scale from simple Q&A to complex workflows

## 🏗️ Architecture

```
Discord (Slash Commands) 
    ↓
Discord Bot (discord.js)
    ↓
Agent Service (OpenAI + MCP Bridge)
    ↓
MCP HTTP Server (Safe Web Browsing)
    ↓
MySQL Database (Audit & Sessions)
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Discord Application & Bot Token
- OpenAI API Key

### 1. Setup Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the bot token and application ID
5. Go to "OAuth2" → "URL Generator"
6. Select scopes: `bot`, `applications.commands`
7. Select permissions: `Send Messages`, `Create Public Threads`, `Use Slash Commands`
8. Invite the bot to your test server

### 2. Environment Configuration

```bash
# Copy the example environment file
cp env.example .env

# Edit .env with your values
DISCORD_TOKEN=your_bot_token_here
DISCORD_APP_ID=your_application_id_here
GUILD_ID=your_test_server_id_here
OPENAI_API_KEY=your_openai_api_key_here
MYSQL_PASSWORD=your_secure_password_here
```

### 3. Start the Services

```bash
# Development mode
docker compose -f infra/compose/docker-compose.dev.yml up --build

# Production mode
docker compose -f infra/compose/docker-compose.prod.yml up --build
```

### 4. Test the Bot

In your Discord server, try:
```
/ask Hello! What can you help me with?
/ask Fetch https://example.com and summarize the content
/help
```

## 📁 Project Structure

```
discourse/
├── apps/
│   ├── discord-bot/          # Discord.js bot with slash commands
│   └── agent-service/        # OpenAI integration & MCP bridge
├── services/
│   └── mcp/
│       └── mcp-http/         # Safe HTTP browsing MCP server
├── packages/
│   └── core/                 # Shared types, schemas, utilities
├── infra/
│   └── compose/              # Docker Compose configurations
└── docs/
    └── ADRs/                 # Architecture Decision Records
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Discord bot token | Required |
| `DISCORD_APP_ID` | Discord application ID | Required |
| `GUILD_ID` | Test server ID for command registration | Required |
| `OPENAI_API_KEY` | OpenAI API key | Required |
| `ALLOWED_HOSTS` | Comma-separated list of allowed domains | `example.com` |
| `ALLOWED_TOOLS` | Comma-separated list of allowed tools | `http.get` |
| `MAX_HTTP_BYTES` | Maximum bytes to fetch from URLs | `100000` |

### Security Features

- **URL Allowlisting**: Only fetch from explicitly allowed domains
- **Size Limits**: Prevent large downloads with byte limits
- **Audit Logging**: Every interaction is logged to MySQL
- **Error Handling**: Graceful degradation when services are unavailable
- **Input Validation**: All inputs validated with Zod schemas

## 🛠️ Development

### Local Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run in development mode
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint
```

### Adding New MCP Tools

1. Create a new MCP server in `services/mcp/`
2. Implement the MCP protocol (tools/resources/prompts)
3. Add the tool to the agent service's tool registry
4. Update the allowlist configuration

### Database Migrations

```bash
# Generate new migration
cd apps/agent-service
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate
```

## 📊 Monitoring

### Health Checks

- **Agent Service**: `http://localhost:8080/healthz`
- **MCP HTTP**: `http://localhost:3000/health`

### Logs

All services use structured JSON logging with:
- Request IDs for tracing
- User and channel context
- Performance metrics
- Error details

### Database Queries

```sql
-- Recent runs
SELECT * FROM runs ORDER BY created_at DESC LIMIT 10;

-- Tool usage statistics
SELECT tools_used, COUNT(*) as count 
FROM runs 
WHERE tools_used IS NOT NULL 
GROUP BY tools_used;

-- Error analysis
SELECT error, COUNT(*) as count 
FROM runs 
WHERE status = 'error' 
GROUP BY error;
```

## 🔒 Security Considerations

- **Principle of Least Privilege**: Tools are allowlisted and permissioned
- **Input Sanitization**: All user inputs are validated
- **Rate Limiting**: Built into Discord's interaction model
- **Audit Trail**: Complete logging of all actions
- **Network Isolation**: Services communicate over internal Docker network

## 🚀 Deployment

### Production Deployment

1. Set up environment variables for production
2. Use production Docker Compose configuration
3. Set up reverse proxy (nginx/traefik) for HTTPS
4. Configure monitoring and alerting
5. Set up database backups

### Scaling Considerations

- **Horizontal Scaling**: Stateless services can be replicated
- **Database**: Consider read replicas for high load
- **Caching**: Add Redis for session and response caching
- **Load Balancing**: Use multiple agent service instances

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

- Check the [ADRs](docs/ADRs/) for architectural decisions
- Review logs for troubleshooting
- Open an issue for bugs or feature requests

---

**Sprint 1 Status**: ✅ Complete - Basic Discord bot with /ask command, OpenAI integration, MCP HTTP tool, and full audit logging.