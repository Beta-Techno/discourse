import type { Request, Response } from 'express';

type RunEventType = 'plan' | 'tool_call' | 'token' | 'message' | 'done' | 'error';
export type RunEvent = { type: RunEventType; data: any };

type Client = {
  id: string;
  res: Response;
  runId: string;
  heartbeat: NodeJS.Timeout;
};

const clients = new Map<string, Set<Client>>();
const ids = new Map<string, number>();

function writeSse(res: Response, payload: { id?: number; event?: string; data?: any }) {
  if (payload.id !== undefined) res.write(`id: ${payload.id}\n`);
  if (payload.event) res.write(`event: ${payload.event}\n`);
  if (payload.data !== undefined) {
    const text = typeof payload.data === 'string' ? payload.data : JSON.stringify(payload.data);
    for (const line of String(text).split(/\r?\n/)) res.write(`data: ${line}\n`);
  }
  res.write('\n');
}

export function streamRun(req: Request, res: Response) {
  const runId = req.params.id;
  if (!runId) {
    res.status(400).json({ error: 'Missing run ID' });
    return;
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // avoid proxy buffering
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Keep the socket alive indefinitely for SSE
  req.socket.setKeepAlive(true, 60_000);
  req.setTimeout(0);
  res.setTimeout(0);
  res.flushHeaders?.();

  // Tell client our retry hint
  res.write('retry: 5000\n\n');

  // Initial comment to flush
  res.write(':\n\n');

  const client: Client = {
    id: Math.random().toString(36).slice(2),
    res,
    runId,
    heartbeat: setInterval(() => {
      // heartbeat < client heartbeatTimeout (we'll set 120s on client)
      writeSse(res, { event: 'ping', data: '{}' });
    }, 15_000),
  };

  if (!clients.has(runId)) clients.set(runId, new Set());
  clients.get(runId)!.add(client);

  const onClose = () => {
    clearInterval(client.heartbeat);
    clients.get(runId)?.delete(client);
    if ((clients.get(runId)?.size ?? 0) === 0) {
      clients.delete(runId);
      ids.delete(runId);
    }
    try { res.end(); } catch {}
  };

  req.on('close', onClose);
  req.on('end', onClose);
}

export function emitRunEvent(runId: string, type: RunEventType, data: any) {
  const subs = clients.get(runId);
  if (!subs || subs.size === 0) return;

  const id = (ids.get(runId) ?? 0) + 1;
  ids.set(runId, id);

  for (const c of subs) {
    try {
      writeSse(c.res, { id, event: type, data });
      if (type === 'done' || type === 'error') {
        // Graceful end shortly after terminal event
        setTimeout(() => {
          try { c.res.end(); } catch {}
          clearInterval(c.heartbeat);
          subs.delete(c);
        }, 250);
      }
    } catch {
      clearInterval(c.heartbeat);
      subs.delete(c);
    }
  }
}