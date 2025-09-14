// Ensure Web Streams exist before undici/discord.js load
try {
  const { ReadableStream, WritableStream, TransformStream } = require('node:stream/web');
  globalThis.ReadableStream ??= ReadableStream;
  globalThis.WritableStream ??= WritableStream;
  globalThis.TransformStream ??= TransformStream;
} catch (e) {
  console.warn('Web Streams not available:', e);
}
