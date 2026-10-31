(() => {
  window.__evaAdapter?.dispose();
  const pending = new Map();
  let stopped = false;
  let next = 0;
  let epoch = 0;
  let inFlight = false;
  let hintRetrySeconds = 0;
  let timer = null;
  let failures = 0;
  let retryAt = 0;
  const VISIBLE_INTERVAL_MS = 5 * 60 * 1000;
  const BACKOFF_MS = [15e3, 60e3, 5 * 60e3];

  const emit = value => { try { window.__evaHostEvent(JSON.stringify(value)); } catch {} };

  // Method names come from the version adapter the node selected for this
  // fingerprint; hard-coded names would only ever match one Codex build.
  const host = window.__EVA_HOST__ || {};
  const methods = host.methods || {};
  const approvalSuffixes = host.approvalSuffixes || ['/requestApproval', '/requestUserInput'];

  async function request(method, params, hostId = 'local') {
    if (stopped) throw Error('CLOSED');
    const id = `codex-eva:${uniqueId()}:${++next}`;
    return await new Promise((resolve, reject) => {
      // Named so the quota retry loop never mistakes it for its own schedule timer.
      const deadline = setTimeout(() => { pending.delete(id); reject(Error('REQUEST_TIMEOUT')); }, 8000);
      pending.set(id, { resolve, reject, timer: deadline });
      let sent;
      try {
        // The host bridge is a synchronous call; if it throws, clear our entry so
        // the retry path sees a plain rejection instead of a silent no-op.
        sent = Promise.resolve(
          window.electronBridge.sendMessageFromView({ type: 'mcp-request', hostId, request: { id, method, params } }),
        );
      } catch (error) {
        clearTimeout(deadline);
        pending.delete(id);
        reject(Error('SEND_FAILED'));
        return;
      }
      sent.catch(() => { clearTimeout(deadline); pending.delete(id); reject(Error('SEND_FAILED')); });
    });
  }

  // crypto.randomUUID is secure-context only in some builds; fall back to getRandomValues.
  function uniqueId() {
    try {
      if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }
  }

  async function metadata(hostId, threadId) {
    if (typeof threadId !== 'string') return;
    try {
      const result = await request(methods.threadRead, { threadId, includeTurns: false }, hostId);
      emit({ type: 'thread-source', hostId, threadId, source: result?.thread?.source });
    } catch {}
  }

  async function message(event) {
    if (event.source && event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'mcp-response' && pending.has(data.message?.id)) {
      event.stopImmediatePropagation();
      const item = pending.get(data.message.id);
      pending.delete(data.message.id);
      clearTimeout(item.timer);
      data.message.error ? item.reject(Error('HOST_REQUEST_FAILED')) : item.resolve(data.message.result);
      return;
    }
    if (data.type !== 'mcp-notification' && data.type !== 'mcp-request') return;
    const method = data.method || data.request?.method;
    const params = data.params || data.request?.params || {};
    const hostId = data.hostId || 'local';
    if (method === methods.accountChanged || method === methods.loginCompleted) {
      // A different account invalidates any in-flight answer for the old one.
      epoch++; failures = 0; retryAt = 0; hintRetrySeconds = 0;
      emit({ type: 'account-changed' }); schedule(0); return;
    }
    if (method === methods.quotaPush) { epoch++; emit({ type: 'quota', payload: params }); return; }
    // The host may tell us how long to wait after throttling a request.
    if (method === methods.rateLimited) {
      const seconds = Number(params.retryAfterSeconds ?? params.retry_after_seconds ?? params.retryAfter);
      if (Number.isFinite(seconds) && seconds > 0) {
        hintRetrySeconds = seconds;
        retryAt = Math.max(retryAt, Date.now() + seconds * 1000);
        schedule(seconds * 1000);
      }
      return;
    }
    if (method === methods.threadStarted) {
      emit({ type: 'thread-source', hostId, threadId: params.thread?.id, source: params.thread?.source });
      return;
    }
    const isApproval = approvalSuffixes.some((suffix) => method?.endsWith(suffix));
    if (method !== methods.turnCompleted && !isApproval) return;
    // Read metadata without turns. Never forward message content or tool arguments.
    await metadata(hostId, params.threadId);
    emit({
      type: 'notification', hostId, method,
      params: { threadId: params.threadId, turnId: params.turnId, turn: params.turn ? { id: params.turn.id, status: params.turn.status } : undefined },
    });
  }

  /**
   * Fetches the quota once. On failure asks for a retry: a host-provided
   * `retryAfterSeconds` wins (server throttling), otherwise a capped backoff.
   * An answer belonging to an account that has since changed is dropped.
   */
  // Not async on purpose: as an async function, any synchronous throw would
  // surface as a silently ignored rejected promise instead of reaching the caller.
  function refresh() {
    return runRefresh();
  }

  async function runRefresh() {
    if (stopped || inFlight) return;
    if (document.visibilityState === 'hidden') { skippedWhileHidden = true; return; }
    if (Date.now() < retryAt) { schedule(retryAt - Date.now()); return; }
    inFlight = true;
    const generation = epoch;
    try {
      const payload = await request(methods.quotaRead, null);
      if (generation === epoch) { failures = 0; retryAt = 0; emit({ type: 'quota', payload }); }
    } catch (error) {
      if (generation !== epoch) return;
      const hinted = Number.isFinite(hintRetrySeconds) && hintRetrySeconds > 0 ? hintRetrySeconds * 1000 : 0;
      hintRetrySeconds = 0;
      const backoff = hinted || BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
      failures += 1;
      retryAt = Date.now() + backoff;
      if (generation === epoch) emit({ type: 'quota-error', code: error?.message || 'QUOTA_FAILED', retryInMs: backoff });
    } finally {
      inFlight = false;
      schedule(generation !== epoch ? 0 : failures ? Math.max(0, retryAt - Date.now()) : VISIBLE_INTERVAL_MS);
    }
  }

  function schedule(delayMs) {
    clearTimeout(timer);
    timer = null;
    if (stopped) return;
    if (document.visibilityState === 'hidden') { skippedWhileHidden = true; return; }
    const wait = Math.max(0, delayMs, retryAt - Date.now());
    timer = setTimeout(() => {
      timer = null;
      refresh();
    }, wait);
  }

  // Hidden pages pause the schedule; coming back refreshes at once, even on the
  // very first load, without reseeding a five-minute timer.
  let skippedWhileHidden = false;
  function visibility() {
    if (document.visibilityState === 'visible') {
      if (skippedWhileHidden) { skippedWhileHidden = false; refresh(); }
      else if (!timer && !inFlight) schedule(0);
      return;
    }
    clearTimeout(timer);
    timer = null;
    skippedWhileHidden = true;
  }

  window.addEventListener('message', message, true);
  document.addEventListener('visibilitychange', visibility);
  // The skin's refresh button runs in the page, so it needs a page-scoped handle.
  window.__evaQuota = { refresh };
  window.__evaAdapter = {
    refresh,
    adapterId: host.id || null,
    dispose() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
      window.removeEventListener('message', message, true);
      document.removeEventListener('visibilitychange', visibility);
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('CLOSED')); }
      pending.clear();
      delete window.__evaAdapter;
      delete window.__evaQuota;
    },
  };
  refresh();
})();
