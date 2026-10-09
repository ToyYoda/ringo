// Server-Sent Events: one channel per wedding (live program, new photos, announcements).
const channels = new Map(); // weddingId -> Set<res>

export function subscribe(weddingId, req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  let set = channels.get(weddingId);
  if (!set) channels.set(weddingId, (set = new Set()));
  set.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    set.delete(res);
    if (!set.size) channels.delete(weddingId);
  });
}

export function publish(weddingId, type, data = {}) {
  const set = channels.get(Number(weddingId));
  if (!set) return;
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(msg);
}
