// Ensure Web Streams exist before undici/discord.js load
try {
  const { ReadableStream, WritableStream, TransformStream } = require('node:stream/web');
  globalThis.ReadableStream ??= ReadableStream;
  globalThis.WritableStream ??= WritableStream;
  globalThis.TransformStream ??= TransformStream;
} catch (e) {
  console.warn('Web Streams not available:', e);
}

// Ensure fetch exists for EventSource
try {
  const { fetch } = require('undici');
  globalThis.fetch ??= fetch;
} catch (e) {
  console.warn('Fetch not available:', e);
}
