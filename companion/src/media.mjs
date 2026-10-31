import { spawn as nodeSpawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';

const POWERSHELL = 'powershell.exe';
const SCRIPT_PATH = fileURLToPath(new URL('../windows/system-nowplaying.ps1', import.meta.url));
const ACTIONS = new Set(['playpause', 'next', 'previous', 'play', 'pause']);
const DEFAULT_TIMEOUT_MS = 5000;

function failure(code) {
  return { ok: false, code, playing: false, state: '' };
}

function isBridgeResponse(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Creates a Windows-only GSMTC bridge using a persistent, line-oriented PowerShell process. */
export function createMediaBridge({
  signal,
  spawn: spawnProcess = nodeSpawn,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  platform = process.platform,
} = {}) {
  let child = null;
  let pending = null;
  let closed = false;
  let tail = Promise.resolve();

  const drop = (processToDrop = child, code = 'SYSTEM_MEDIA_UNAVAILABLE') => {
    if (!processToDrop || processToDrop !== child) return;
    child = null;
    const waiting = pending?.child === processToDrop ? pending : null;
    if (waiting) {
      pending = null;
      clearTimeout(waiting.timer);
      waiting.resolve(failure(code));
    }
    try { processToDrop.stdin?.end(); } catch { /* Process may already be gone. */ }
    try { processToDrop.kill(); } catch { /* Process may already be gone. */ }
  };

  const onAbort = () => {
    closed = true;
    drop(child, 'ABORTED');
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  const start = () => {
    let processHandle;
    try {
      processHandle = spawnProcess(POWERSHELL, [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', SCRIPT_PATH, 'serve',
      ], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    } catch {
      return null;
    }
    child = processHandle;
    const decoder = new StringDecoder('utf8');
    let buffer = '';

    processHandle.stdout?.on('data', (chunk) => {
      if (child !== processHandle) return;
      buffer += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8'));
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line || pending?.child !== processHandle || line[0] !== '{') continue;
        let response;
        try { response = JSON.parse(line); } catch { continue; }
        if (!isBridgeResponse(response)) continue;
        const waiting = pending;
        pending = null;
        clearTimeout(waiting.timer);
        waiting.resolve(response);
      }
    });
    processHandle.stdout?.on('error', () => drop(processHandle));
    processHandle.on?.('error', () => drop(processHandle));
    processHandle.on?.('exit', () => drop(processHandle));
    return processHandle;
  };

  const request = (line) => {
    const task = tail.then(() => new Promise((resolve) => {
      if (signal?.aborted) { resolve(failure('ABORTED')); return; }
      if (closed) { resolve(failure('CLOSED')); return; }
      if (platform !== 'win32') { resolve(failure('UNSUPPORTED_PLATFORM')); return; }

      const processHandle = child ?? start();
      if (!processHandle || !processHandle.stdin?.writable) {
        drop(processHandle);
        resolve(failure('SYSTEM_MEDIA_UNAVAILABLE'));
        return;
      }

      const waiting = {
        child: processHandle,
        resolve,
        timer: setTimeout(() => drop(processHandle), timeoutMs),
      };
      pending = waiting;
      try {
        processHandle.stdin.write(`${line}\n`);
      } catch {
        drop(processHandle);
      }
    }));
    tail = task.then(() => undefined, () => undefined);
    return task;
  };

  const control = (action, sourceId) => {
    if (!ACTIONS.has(action)) return Promise.resolve({ ok: false, code: 'ACTION' });
    if (typeof sourceId !== 'string' || /[\0\t\r\n]/.test(sourceId)) {
      return Promise.resolve({ ok: false, code: 'SOURCE_ID' });
    }
    return request(`${action}\t${sourceId}`);
  };

  return {
    read: () => request('read'),
    control,
    close() {
      if (closed) return;
      closed = true;
      signal?.removeEventListener('abort', onAbort);
      drop(child, 'CLOSED');
    },
  };
}
