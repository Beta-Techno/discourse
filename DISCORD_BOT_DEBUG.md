# Discord Bot ReadableStream Error - Debug Report

## Problem Summary
The Discord bot fails to start with `ReferenceError: ReadableStream is not defined` when using discord.js v14.14.1 with Node.js v20.19.0.

## Error Details
```
ReferenceError: ReadableStream is not defined
    at Object.<anonymous> (/Users/damicorobot/dv/web/node/discourse/node_modules/undici/lib/web/fetch/response.js:528:3)
```

## Environment
- **Node.js Version**: v20.19.0 (switched from v16.20.2)
- **npm Version**: v10.8.2
- **OS**: macOS Darwin 24.6.0 (Apple Silicon M1/M2)
- **Architecture**: arm64
- **Package Manager**: npm with workspaces

## Dependencies
```json
{
  "discord.js": "^14.14.1",
  "undici": "^6.21.3" (transitive dependency)
}
```

## Attempted Solutions

### 1. Polyfill Approach (FAILED)
```typescript
// Polyfill for ReadableStream and other web APIs
import { ReadableStream, WritableStream, TransformStream } from 'stream/web';
globalThis.ReadableStream = ReadableStream;
globalThis.WritableStream = WritableStream;
globalThis.TransformStream = TransformStream;
```
**Result**: Still fails with same error. The polyfill is loaded after the undici module is already imported.

### 2. Import Order Issue
The error occurs in `undici/lib/web/fetch/response.js:528` which is loaded before our polyfill can be applied.

## Root Cause Analysis

### The Problem
1. **discord.js v14** depends on **undici v6.21.3**
2. **undici** uses Web Streams API (`ReadableStream`, `WritableStream`, etc.)
3. **Node.js v20** has Web Streams API, but there's a module loading order issue
4. The **undici** module is loaded before our polyfill can be applied

### Why This Happens
- **undici** is a transitive dependency loaded automatically
- The error occurs at module load time, not runtime
- Our polyfill runs after the problematic module is already loaded

## Current Status
- ✅ **MCP HTTP Service**: Running successfully on port 3000
- ✅ **Agent Service**: Running successfully on port 8080 with mock database
- ❌ **Discord Bot**: Fails to start due to ReadableStream error

## Potential Solutions to Research

### 1. Node.js Version Compatibility
- **Research**: Check if Node.js v20.19.0 has Web Streams API properly exposed
- **Test**: Try Node.js v18.x or v22.x
- **Command**: `nvm use 18` or `nvm use 22`

### 2. Discord.js Version Downgrade
- **Research**: Use discord.js v13.x which might not depend on undici
- **Test**: Downgrade to `"discord.js": "^13.15.1"`
- **Risk**: May lose v14 features

### 3. Undici Version Pinning
- **Research**: Pin undici to a version that works with Node.js v20
- **Test**: Add `"undici": "^5.28.4"` to package.json
- **Risk**: May break discord.js compatibility

### 4. Module Resolution Fix
- **Research**: Use `--experimental-global-webcrypto` or `--experimental-global-fetch` flags
- **Test**: `node --experimental-global-webcrypto dist/index.js`
- **Risk**: Experimental features

### 5. Alternative HTTP Client
- **Research**: Replace axios with node-fetch or native fetch
- **Test**: Use Node.js built-in fetch (available in v20)
- **Risk**: May not solve the undici dependency

### 6. Build-time Polyfill
- **Research**: Use webpack or esbuild to inject polyfills at build time
- **Test**: Configure tsx to inject polyfills
- **Risk**: Complex build configuration

### 7. Environment Variable Fix
- **Research**: Set `NODE_OPTIONS="--experimental-global-webcrypto"`
- **Test**: Add to package.json scripts
- **Risk**: May not work in all environments

## Files to Check
1. `/Users/damicorobot/dv/web/node/discourse/node_modules/undici/lib/web/fetch/response.js:528`
2. `/Users/damicorobot/dv/web/node/discourse/apps/discord-bot/src/index.ts`
3. `/Users/damicorobot/dv/web/node/discourse/apps/discord-bot/package.json`

## Test Commands
```bash
# Check Node.js version
node --version

# Check if Web Streams are available
node -e "console.log(typeof ReadableStream)"

# Test with experimental flags
node --experimental-global-webcrypto apps/discord-bot/dist/index.js

# Check undici version
npm list undici
```

## Success Criteria
- Discord bot starts without ReadableStream error
- Bot can connect to Discord API
- Slash commands can be registered
- Bot responds to `/ask` commands

## Next Steps for Research Agent
1. **Investigate Node.js v20 Web Streams API compatibility**
2. **Research discord.js v14 + undici + Node.js v20 compatibility matrix**
3. **Test alternative Node.js versions (v18, v22)**
4. **Research build-time polyfill injection methods**
5. **Investigate if this is a known issue with solutions**

## Related Issues
- [discord.js GitHub Issues](https://github.com/discordjs/discord.js/issues)
- [undici GitHub Issues](https://github.com/nodejs/undici/issues)
- [Node.js Web Streams API Documentation](https://nodejs.org/api/webstreams.html)

## Current Working Services
The MCP HTTP service and Agent service are working perfectly, so the issue is isolated to the Discord bot's dependency chain.
