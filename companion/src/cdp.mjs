export async function connectCdp(endpoint, {timeoutMs = 5000, WebSocketImpl = globalThis.WebSocket} = {}) {
  const url = new URL(endpoint);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password ||
      url.search || url.hash || !/^\/devtools\/(page|browser)\/[\w-]+$/.test(url.pathname)) throw new Error('INVALID_ENDPOINT');
  const socket = new WebSocketImpl(url.href);
  const pending = new Map(); const listeners = new Map(); let nextId = 0; let closed = false;
  const drop = () => {
    if (closed) return;
    closed = true;
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('CDP_CLOSED')); }
    pending.clear(); listeners.clear();
    socket.removeEventListener('message', message);
  };
  const message = event => {
    let data; try { data = JSON.parse(event.data); } catch { return; }
    if (data.id != null) {
      const item = pending.get(data.id); if (!item) return;
      pending.delete(data.id); clearTimeout(item.timer);
      data.error ? item.reject(new Error(`CDP_ERROR:${data.error.code}:${data.error.message}`)) : item.resolve(data.result);
    } else {
      for (const listener of listeners.get(data.method) ?? []) { try { listener(data.params); } catch { /* One subscriber must not break other requests. */ } }
    }
  };
  socket.addEventListener('message', message); socket.addEventListener('close', drop); socket.addEventListener('error', drop);
  await new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timer); socket.removeEventListener('open', ready); socket.removeEventListener('error', fail); socket.removeEventListener('close', fail);
      if (error) { socket.close(); reject(error); } else resolve();
    };
    const ready = () => finish(); const fail = () => finish(new Error('CDP_CONNECT_FAILED'));
    const timer = setTimeout(() => finish(new Error('CDP_CONNECT_TIMEOUT')), timeoutMs);
    socket.addEventListener('open', ready, {once:true}); socket.addEventListener('error', fail, {once:true}); socket.addEventListener('close', fail, {once:true});
  });
  return {
    send(method, params = {}) {
      if (closed) return Promise.reject(new Error('CDP_CLOSED'));
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {pending.delete(id); reject(new Error(`CDP_TIMEOUT:${method}`));}, timeoutMs);
        pending.set(id, {resolve,reject,timer});
        try { socket.send(JSON.stringify({id,method,params})); } catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
      });
    },
    on(method, listener) {
      if (closed) throw new Error('CDP_CLOSED');
      if (!listeners.has(method)) listeners.set(method,new Set());
      listeners.get(method).add(listener);
      return () => {listeners.get(method)?.delete(listener);};
    },
    close() { drop(); socket.close(); },
  };
}
