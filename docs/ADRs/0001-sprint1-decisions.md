# ADR-0001: Sprint 1 Architecture Decisions

**Date**: 2024-01-01  
**Status**: Accepted  
**Context**: Initial implementation of Discourse AI Discord bot

## Decision Summary

We are implementing a minimal but solid foundation for a Discord-native AI assistant with the following key decisions:

1. **Start with MCP from day one** - Include one safe MCP tool (http.get) to validate the full tool pathway
2. **Discord-first UX** - Use slash commands and thread-based conversations
3. **TypeScript monorepo** - Single repository with multiple packages for maintainability
4. **OpenAI Responses API** - Direct integration without complex orchestration initially
5. **MySQL for audit** - Simple relational database for logging and user management
6. **Docker deployment** - Containerized services for easy deployment on Proxmox

## Detailed Decisions

### 1. MCP Integration Strategy

**Decision**: Include MCP from the start with one safe tool (http.get)

**Rationale**:
- Validates the complete tool pathway early
- Avoids re-plumbing the system later
- Provides immediate value with safe web browsing
- Establishes patterns for future tool additions

**Alternatives Considered**:
- Direct OpenAI function calling without MCP
- Complex multi-tool setup from the start

**Trade-offs**:
- ✅ Proves tool integration works
- ✅ Safe, read-only tool with clear boundaries
- ❌ Slightly more complex initial setup
- ❌ Additional service to maintain

### 2. Discord UX Model

**Decision**: Slash commands + thread-based conversations

**Rationale**:
- Discord's official, supported interaction model
- Threads provide natural conversation boundaries
- Ephemeral responses keep channels clean
- Deterministic UX with proper error handling

**Alternatives Considered**:
- Direct message conversations
- Channel-based conversations
- Webhook-based interactions

**Trade-offs**:
- ✅ Official Discord API support
- ✅ Clean channel management
- ✅ Built-in permission system
- ❌ Limited to Discord ecosystem
- ❌ Thread creation requires additional API calls

### 3. Technology Stack

**Decision**: TypeScript + Node.js + Express + MySQL

**Rationale**:
- TypeScript provides strong typing for API contracts
- Node.js ecosystem has excellent Discord and OpenAI libraries
- Express is simple and well-understood
- MySQL fits existing infrastructure preferences

**Alternatives Considered**:
- Python with FastAPI
- Go with Gin
- Rust with Axum
- PostgreSQL database

**Trade-offs**:
- ✅ Strong typing and developer experience
- ✅ Rich ecosystem for integrations
- ✅ Familiar technology stack
- ❌ Single-threaded Node.js model
- ❌ MySQL vs PostgreSQL feature differences

### 4. Orchestration Approach

**Decision**: Simple single-step processing without LangGraph initially

**Rationale**:
- Reduces complexity for Sprint 1
- OpenAI can handle simple tool calling directly
- Can add LangGraph in future sprints for complex workflows
- Focus on getting the foundation right

**Alternatives Considered**:
- LangGraph from the start
- Custom orchestration logic
- Multiple specialized agents

**Trade-offs**:
- ✅ Simpler initial implementation
- ✅ Faster time to market
- ✅ Easier to debug and test
- ❌ Limited to simple workflows initially
- ❌ Will need refactoring for complex scenarios

### 5. Database Design

**Decision**: Simple two-table schema (users, runs)

**Rationale**:
- Minimal schema for Sprint 1 requirements
- Easy to understand and maintain
- Sufficient for audit logging and basic user management
- Can be extended in future sprints

**Alternatives Considered**:
- More complex schema with sessions, tools, etc.
- NoSQL database (MongoDB, etc.)
- In-memory storage only

**Trade-offs**:
- ✅ Simple to implement and query
- ✅ ACID compliance for audit logs
- ✅ Easy to backup and restore
- ❌ Will need schema changes for complex features
- ❌ No built-in caching or performance optimization

### 6. Deployment Strategy

**Decision**: Docker Compose for both development and production

**Rationale**:
- Consistent environment across dev/staging/prod
- Easy to deploy on Proxmox
- Simple service discovery and networking
- Can be upgraded to Kubernetes later if needed

**Alternatives Considered**:
- Direct deployment on host
- Kubernetes from the start
- Serverless deployment (AWS Lambda, etc.)

**Trade-offs**:
- ✅ Simple deployment and management
- ✅ Consistent environments
- ✅ Easy to scale horizontally
- ❌ Single point of failure (single VM)
- ❌ Manual scaling and load balancing

## Implementation Details

### Service Architecture

```
discord-bot (Port 3000)
├── Registers slash commands
├── Handles user interactions
└── Calls agent-service API

agent-service (Port 8080)
├── Processes OpenAI requests
├── Manages MCP tool calls
├── Creates Discord threads
└── Logs to MySQL

mcp-http (Port 3000)
├── Implements MCP protocol
├── Enforces URL allowlist
├── Limits response sizes
└── Returns structured data

mysql (Port 3306)
├── Stores user data
├── Logs all runs
└── Provides audit trail
```

### Security Model

- **URL Allowlisting**: Only fetch from explicitly allowed domains
- **Size Limits**: Prevent large downloads (100KB default)
- **Input Validation**: All inputs validated with Zod schemas
- **Error Handling**: Graceful degradation, no sensitive data exposure
- **Audit Logging**: Every action logged with user context

### Monitoring and Observability

- **Health Checks**: `/healthz` and `/readyz` endpoints
- **Structured Logging**: JSON logs with request IDs
- **Database Queries**: Simple SQL for monitoring
- **Error Tracking**: Comprehensive error logging

## Future Considerations

### Sprint 2+ Enhancements

1. **Additional MCP Tools**: File system, database, GitHub integration
2. **Complex Orchestration**: LangGraph for multi-step workflows
3. **Role-Based Access**: Discord role mapping to tool permissions
4. **Approval Workflows**: Human-in-the-loop for destructive actions
5. **Vector Search**: RAG capabilities with document embeddings

### Scalability Path

1. **Horizontal Scaling**: Multiple agent-service instances
2. **Database Optimization**: Read replicas, connection pooling
3. **Caching Layer**: Redis for session and response caching
4. **Load Balancing**: Reverse proxy with health checks
5. **Container Orchestration**: Kubernetes migration path

## Success Metrics

- **Functionality**: Bot responds to /ask commands successfully
- **Tool Integration**: HTTP GET tool works with allowlisted URLs
- **Reliability**: Services start and stay healthy
- **Audit**: All interactions logged to database
- **Performance**: Sub-10 second response times for simple queries

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenAI API limits | High | Monitor usage, implement backoff |
| Discord rate limits | Medium | Use proper deferral patterns |
| Database connection issues | Medium | Connection pooling, health checks |
| MCP service failures | Low | Graceful degradation, error handling |
| Security vulnerabilities | High | Input validation, allowlisting, audit logs |

## Conclusion

This architecture provides a solid foundation for a Discord-native AI assistant while keeping complexity minimal for Sprint 1. The decisions made here enable rapid iteration and future enhancement while maintaining security and reliability.

The key success factor is proving that the MCP tool integration works end-to-end, which will make future tool additions straightforward and maintainable.
