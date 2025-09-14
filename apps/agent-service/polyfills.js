// Polyfill TransformStream for Node.js compatibility
const { TransformStream, ReadableStream, WritableStream } = require('stream/web');

if (!globalThis.TransformStream) {
  globalThis.TransformStream = TransformStream;
}

if (!globalThis.ReadableStream) {
  globalThis.ReadableStream = ReadableStream;
}

if (!globalThis.WritableStream) {
  globalThis.WritableStream = WritableStream;
}
