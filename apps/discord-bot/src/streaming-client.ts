const EventSource = require('eventsource');

export type RunEvent =
  | { type: 'plan'; data: any }
  | { type: 'tool_call'; data: any }
  | { type: 'token'; data: any }
  | { type: 'message'; data: any }
  | { type: 'error'; data: any }
  | { type: 'done'; data: any }
  | { type: 'ping'; data: any };

export class StreamingClient {
  private es: EventSource | undefined;
  private url?: string;
  private onEvent: (ev: RunEvent) => void;
  private onFatal: (err: Error) => void;
  private closed = false;
  private lastEventId?: string;
  private retries = 0;
  private maxRetries = 20;

  constructor(onEvent: (ev: RunEvent) => void, onFatal: (err: Error) => void) {
    this.onEvent = onEvent;
    this.onFatal = onFatal;
  }

  connect(runId: string, apiBaseUrl: string) {
    this.url = `${apiBaseUrl.replace(/\/$/, '')}/runs/${encodeURIComponent(runId)}/events`;
    this.closed = false;
    this.retries = 0;
    this.open();
  }

  private open() {
    if (!this.url) return;

    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (this.lastEventId) headers['Last-Event-ID'] = this.lastEventId;

    this.es = new EventSource(this.url, {
      headers,
      // The node 'eventsource' client closes if it sees no bytes for this long.
      // Server sends 'ping' every 15s; give a lot of headroom here.
      heartbeatTimeout: 120_000,
    } as any);

    const forward = (type: RunEvent['type']) => (e: any) => {
      this.lastEventId = (e as any).lastEventId;
      let data: any = undefined;
      try { data = e.data ? JSON.parse(String(e.data)) : undefined; } catch { data = e.data; }
      this.onEvent({ type, data } as RunEvent);
      if (type === 'done' || type === 'error') this.disconnect();
    };

    // Default event + named events we emit from the server
    if (this.es) {
      this.es.onmessage = forward('message');
      ['plan', 'tool_call', 'token', 'message', 'error', 'done', 'ping'].forEach((evt) => {
        this.es!.addEventListener(evt, forward(evt as RunEvent['type']));
      });

      this.es.onerror = () => {
        if (this.closed) return;
        this.retries += 1;
        const delay = Math.min(1000 * Math.pow(2, this.retries), 10_000);
        if (this.retries <= this.maxRetries) {
          setTimeout(() => this.reconnect(), delay);
        } else {
          this.onFatal(new Error('SSE connection error'));
        }
      };
    }
  }

  private reconnect() {
    if (this.closed) return;
    try { this.es?.close(); } catch {}
    this.open();
  }

  disconnect() {
    this.closed = true;
    try { this.es?.close(); } catch {}
    this.es = undefined;
  }
}