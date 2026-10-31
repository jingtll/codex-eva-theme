import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle } from './bundle.mjs';
import { discoverCodexAsar, findCodexTarget } from './discovery.mjs';
import { createNotifier } from './events.mjs';
import { createLifecycle } from './lifecycle.mjs';
import { attachSession } from './session.mjs';
import { createMediaBridge } from './media.mjs';
import { playCue, stopSounds } from './sound.mjs';
import { selectAdapter } from './adapters/index.mjs';
import { resourceFingerprint } from './diagnose-fingerprint.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TRAY_SCRIPT = join(ROOT, 'windows', 'tray.ps1');
const TRAY_ACTIONS = new Set(['pause', 'resume', 'open-settings', 'quit']);

export const DEFAULTS = Object.freeze({
  backgroundStrength: 0.18,
  scale: 1,
  portrait: true,
  geometry: true,
  scanlines: true,
  clock: true,
  quota: true,
  music: true,
  sound: true,
  approvalSound: true,
  completedSound: true,
  volume: 0.6,
});

const RANGES = { backgroundStrength: [0, 0.5], scale: [0.6, 1.6], volume: [0, 1] };

/** Keeps only known skin keys and coerces each to its declared range. */
export function sanitizeSettings(patch, current = DEFAULTS) {
  const next = { ...current };
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return next;
  for (const key of Object.keys(DEFAULTS)) {
    if (!Object.hasOwn(patch, key)) continue;
    const value = patch[key];
    if (typeof DEFAULTS[key] === 'boolean' && typeof value === 'boolean') next[key] = value;
    else if (typeof DEFAULTS[key] === 'number' && typeof value === 'number' && Number.isFinite(value)) {
      const [min, max] = RANGES[key];
      next[key] = Math.max(min, Math.min(max, value));
    }
  }
  return next;
}

export function defaultSettingsPath() {
  const base = process.env.APPDATA || join(process.env.USERPROFILE || ROOT, 'AppData', 'Roaming');
  return join(base, 'CodexEva', 'settings.json');
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJsonFile(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

/**
 * Starts windows/tray.ps1 and exposes the line-oriented channel both ways.
 * The tray only ever receives structured JSON status lines; its replies are
 * parsed by the caller against the fixed action set.
 */
function openTrayChannel({ runScript, onAction }) {
  const child = runScript('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA',
    '-File', TRAY_SCRIPT,
  ], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  let buffer = '';
  child.stdout?.on('data', (chunk) => {
    buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onAction(line);
    }
  });
  child.on?.('error', () => {});
  child.stdin?.on?.('error', () => {});
  return {
    child,
    write: (message) => { try { child.stdin?.write(`${JSON.stringify(message)}\n`); } catch { /* Closed. */ } },
    end() {
      try { child.stdin?.end(); } catch { /* Closed. */ }
      try { child.kill(); } catch { /* Already gone. */ }
    },
  };
}

/**
 * Single-instance guard. The lock file records the owning pid; an OS-level
 * liveness probe decides whether that pid still exists, so a crashed
 * companion never blocks the next one.
 */
async function acquireInstanceLock(settingsPath, { allowTakeover = true } = {}) {
  const { open, mkdir, rm } = await import('node:fs/promises');
  const { dirname: dirOf } = await import('node:path');
  const lockPath = `${settingsPath}.lock`;
  await mkdir(dirOf(lockPath), { recursive: true });
  try {
    const handle = await open(lockPath, 'wx', 0o600);
    await handle.writeFile(String(process.pid));
    return {
      async release() {
        await handle.close().catch(() => {});
        await rm(lockPath, { force: true }).catch(() => {});
      },
    };
  } catch (error) {
    if (error?.code !== 'EEXIST' || !allowTakeover) return null;
  }
  let alive = true;
  try {
    const pid = Number(await readFile(lockPath, 'utf8'));
    process.kill(pid, 0);
  } catch {
    alive = false;
  }
  if (alive) return null;
  await rm(lockPath, { force: true }).catch(() => {});
  return acquireInstanceLock(settingsPath, { allowTakeover: false });
}

/**
 * Orchestrates the companion: one connection at a time, a serialized poll loop,
 * persisted skin settings, pilot cues and an optional WinForms tray.
 */
export async function startCompanion(options = {}) {
  const {
    findTarget = findCodexTarget,
    attach: attachImpl = attachSession,
    createNotifier: makeNotifier = createNotifier,
    createMediaBridge: makeMedia = createMediaBridge,
    playCue: playCueImpl = playCue,
    stopSounds: stopSoundsImpl = stopSounds,
    buildBundle: buildBundleImpl = buildBundle,
    settingsPath = defaultSettingsPath(),
    readJson = readJsonFile,
    writeJson = writeJsonFile,
    runScript,
    sendTray,
    onCommand = () => {},
    pollMs = 5000,
    // Port the user launched Codex with (--remote-debugging-port). Read from the
    // environment so the default discovery call actually has somewhere to look.
    debugPort = Number(process.env.CODEX_EVA_DEBUG_PORT) || null,
    // Resource fingerprint of the running client and the probe record that
    // lists which adapter it was verified against.
    fingerprint = null,
    discover = discoverCodexAsar,
    fingerprintOf = resourceFingerprint,
    probeRecordPath = join(ROOT, '..', 'docs', 'validation', 'entry-probe.md'),
    now = () => Date.now(),
  } = options;

  const exclusive = await acquireInstanceLock(settingsPath);
  if (!exclusive) {
    const busy = {
      stopped: true,
      publish: (message) => { try { sendTray?.(message); } catch { /* Closed. */ } },
      async stop() {}, async pause() {}, async resume() {}, async handleTray() {},
    };
    busy.publish({ type: 'status', text: '伴生程序已在运行' });
    return busy;
  }

  let settings = DEFAULTS;
  try {
    settings = sanitizeSettings(await readJson(settingsPath));
  } catch {
    settings = { ...DEFAULTS };
  }

  let state = 'starting';
  let sessionRef = null;
  let trayChannel = null;
  const send = (message) => {
    if (sendTray) { try { sendTray(message); } catch { /* A closed tray must not break the companion. */ } return; }
    trayChannel?.write(message);
  };
  let timer = null;
  let stopping = null;
  // Bumped by every tray or programmatic command so a pause/resume that lands
  // while a cycle is in flight keeps the newer intent.
  let generation = 0;

  const notifier = makeNotifier();
  let installation = null;

  const publish = (message) => send(message);

  async function persist(patch) {
    settings = sanitizeSettings(patch, settings);
    await writeJson(settingsPath, settings).catch(() => {});
    await sessionRef?.syncSettings?.(patch).catch(() => {});
    publish({ type: 'status', text: state === 'paused' ? '已暂停' : '已连接' });
    return settings;
  }

  const lifecycle = createLifecycle({
    findTarget: async () => {
      let port = debugPort;
      if (!port && !fingerprint) {
        installation = await discover();
        port = installation.remoteDebuggingPort;
      }
      const result = port ? await findTarget({ port }) : await findTarget();
      // discovery returns a status record; tests may inject a bare target.
      if (result && typeof result.webSocketDebuggerUrl === 'string' && result.status !== 'endpoint_unavailable') return result;
      return null;
    },
    attach: async (target) => {
      const hostAdapter = await resolveHostAdapter();
      if (hostAdapter.status !== 'verified') {
        publish({ type: 'status', text: hostAdapter.reason });
        throw Error('ADAPTER_UNSUPPORTED');
      }
      const media = makeMedia();
      let session;
      try { session = await attachImpl(target, {
        bundle: await buildBundleImpl(settings, hostAdapter.adapter),
        media,
        notifier,
        getSettings: () => settings,
        setSettings: (patch) => persist(patch),
        playCue: playCueImpl,
        onStatus: (text) => publish({ type: 'status', text }),
      }); } catch (error) { media.close(); throw error; }
      sessionRef = session;
      return {
        tick: () => session.tick?.(),
        openSettings: () => session.openSettings?.(),
        syncSettings: (patch) => session.syncSettings?.(patch),
        async close() {
          try { await session.close?.(); } finally {
            media.close();
            if (sessionRef === session) sessionRef = null;
          }
        },
      };
    },
    onStatus: (text) => publish({ type: 'status', text }),
  });

  async function resolveHostAdapter() {
    let currentFingerprint = fingerprint;
    if (!currentFingerprint) {
      installation = await discover();
      if (installation.status === 'found') currentFingerprint = await fingerprintOf(installation.asarPath);
    }
    let probeRecord = '';
    try { probeRecord = await readFile(probeRecordPath, 'utf8'); } catch { probeRecord = ''; }
    return selectAdapter({ fingerprint: currentFingerprint, probeRecord });
  }

  async function cycle() {
    if (state !== 'running') return;
    // The loop owns failure reporting: a dropped connection is retried on the
    // next poll, but an unexpected attach failure is surfaced instead of
    // leaving the tray stuck on the previous status forever.
    await lifecycle.update().catch((error) => {
      const text = error?.message === 'ADAPTER_UNSUPPORTED' ? '当前 Codex 版本未验证，未接入' : `连接失败：${error?.message || '未知错误'}`;
      publish({ type: 'status', text });
    });
  }

  function schedule() {
    clearTimeout(timer);
    if (state !== 'running') return;
    timer = setTimeout(async () => {
      await cycle().catch(() => {});
      schedule();
    }, pollMs);
  }

  async function handleTray(raw) {
    let action = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') action = parsed.action;
    } catch {
      // Plain text from the tray is also accepted.
    }
    if (typeof action !== 'string' || !TRAY_ACTIONS.has(action)) return;
    generation += 1;
    if (action === 'pause') {
      if (state === 'running') { state = 'paused'; clearTimeout(timer); await lifecycle.pause(); }
    } else if (action === 'resume') {
      if (state === 'paused') {
        state = 'running'; lifecycle.resume();
        const started = generation;
        await cycle().catch(() => {});
        if (generation === started) schedule();
      }
    } else if (action === 'open-settings') {
      if (sessionRef) await sessionRef.openSettings?.().catch(() => {});
      else publish({ type: 'status', text: '设置需要连接 Codex；请先启动已配置调试入口的客户端' });
    } else if (action === 'quit') {
      await instance.stop();
    }
    onCommand(action);
  }

  async function stop() {
    if (stopping) return stopping;
    state = 'stopped';
    stopping = (async () => {
      clearTimeout(timer);
      timer = null;
      sessionRef = null;
      await lifecycle.stop();
      await stopSoundsImpl();
      trayChannel?.end();
      trayChannel = null;
      await exclusive.release();
      publish({ type: 'status', text: '已退出' });
    })();
    return stopping;
  }

  const instance = {
    async start() {
      if (state !== 'starting') return instance;
      state = 'running';
      if (runScript && process.platform === 'win32') {
        trayChannel = openTrayChannel({ runScript, onAction: (line) => { handleTray(line).catch(() => {}); } });
      }
      // Track the first cycle separately so a failed start (e.g. an unsupported
      // client version) still returns a stoppable instance, and say why.
      let deadline;
      try {
        await Promise.race([cycle(), new Promise(resolve => { deadline = setTimeout(resolve, 5000); })]);
      } catch { /* The next cycle retries. */ }
      finally { clearTimeout(deadline); }
      schedule();
      return instance;
    },
    async pause() { await handleTray('pause'); },
    async resume() { await handleTray('resume'); },
    // Called by the page when it toggles a setting, without going through the tray.
    async updateSettings(patch) { await persist(patch); generation += 1; },
    stop,
    handleTray,
    publish,
    get state() { return state; },
    get settings() { return { ...settings }; },
    get tray() { return trayChannel; },
  };

  return await instance.start();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === (await import('node:path')).resolve(process.argv[1])) {
  const { spawn } = await import('node:child_process');
  const instance = await startCompanion({
    runScript: (command, args, opts) => spawn(command, args, { ...opts, cwd: ROOT }),
  });
  if (instance.stopped) process.exit(0);
  const keepAlive = setInterval(() => { if (instance.state === 'stopped') { clearInterval(keepAlive); process.exit(0); } }, 250);
  const shutdown = () => { instance.stop().finally(() => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await new Promise(() => {});
}
