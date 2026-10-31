import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startCompanion } from '../src/main.mjs';

function idle(ms = 5) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeoutMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await idle(5);
  }
  assert.fail('condition not reached before timeout');
}

const stopSounds = async () => 0;
const FAKE_TARGET = { id: 'main', webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/page/main' };

async function settingsFile(t) {
  const dir = await mkdtemp(join(tmpdir(), 'eva-main-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'settings.json');
}

function tracked() {
  const counts = { connectionCount: 0, activeConnections: 0, pendingPollCount: 0, cues: [], settings: [] };
  const notifier = { accept: (event) => ({ kind: event.type, hostId: event.hostId, threadId: event.threadId, turnId: event.turnId }) };
  const playCue = async (cue) => { counts.cues.push(cue); return { ok: true }; };
  let target = null;
  const attach = async () => {
    counts.connectionCount += 1;
    counts.activeConnections += 1;
    let closed = false;
    let polling = 0;
    return {
      kind: 'tracked',
      async tick() {
        if (closed) return;
        counts.pendingPollCount += 1;
        polling += 1;
        await idle(2);
        polling -= 1;
        counts.pendingPollCount -= 1;
      },
      async syncSettings(patch) { counts.settings.push(patch); },
      async close() {
        if (closed) return;
        closed = true;
        counts.activeConnections -= 1;
      },
    };
  };
  return {
    counts,
    notifier,
    playCue,
    attach,
    setTarget(value) { target = value; },
    hasTarget() { return target !== null; },
  };
}

test('polls only while Codex is present and tears everything down on stop', async (t) => {
  const runtime = tracked();
  const messages = [];
  const instance = await startCompanion({
    findTarget: async () => runtime.hasTarget() ? FAKE_TARGET : null,
    attach: runtime.attach,
    createNotifier: () => runtime.notifier,
    playCue: runtime.playCue,
    settingsPath: await settingsFile(t),
    pollMs: 10,
    sendTray: (message) => messages.push(message),
    stopSounds,
  });
  await waitFor(() => messages.some((m) => m.type === 'status' && m.text === '等待 Codex 调试入口'));
  assert.equal(runtime.counts.connectionCount, 0);

  runtime.setTarget(FAKE_TARGET);
  await waitFor(() => runtime.counts.connectionCount === 1);
  await waitFor(() => messages.some((m) => m.type === 'status' && m.text === '已连接'));
  await instance.stop();

  assert.equal(runtime.counts.activeConnections, 0);
  assert.equal(runtime.counts.pendingPollCount, 0);
  const afterStop = runtime.counts.connectionCount;
  await idle(40);
  assert.equal(runtime.counts.connectionCount, afterStop);
});

test('pause closes the live connection, resume reconnects once, and stop is final', async (t) => {
  const runtime = tracked();
  runtime.setTarget({ id: 'main' });
  const instance = await startCompanion({
    findTarget: async () => FAKE_TARGET,
    attach: runtime.attach,
    createNotifier: () => runtime.notifier,
    playCue: runtime.playCue,
    settingsPath: await settingsFile(t),
    pollMs: 5,
    sendTray: () => {},
    stopSounds,
  });
  await waitFor(() => runtime.counts.connectionCount === 1);

  await instance.pause();
  assert.equal(runtime.counts.activeConnections, 0);
  const pausedCount = runtime.counts.connectionCount;
  await idle(30);
  assert.equal(runtime.counts.connectionCount, pausedCount);

  await instance.resume();
  await waitFor(() => runtime.counts.connectionCount === pausedCount + 1);

  await instance.stop();
  await instance.stop();
  assert.equal(runtime.counts.activeConnections, 0);
});

test('settings from the skin are validated, persisted, and handed to later sessions', async (t) => {
  const file = await settingsFile(t);
  const received = [];
  const instance = await startCompanion({
    findTarget: async () => FAKE_TARGET,
    attach: async ({ getSettings, setSettings }) => {
      received.push({ getSettings, setSettings });
      return { async tick() {}, async close() {} };
    },
    createNotifier: () => ({ accept: () => null }),
    playCue: async () => ({ ok: true }),
    settingsPath: file,
    pollMs: 5,
    sendTray: () => {},
    stopSounds,
  });
  await waitFor(() => received.length === 1);
  const first = received[0];
  await first.setSettings({ volume: 0.3, scale: 99, bogusKey: true, music: false });
  const current = first.getSettings();
  assert.equal(current.volume, 0.3);
  assert.equal(current.scale, 1.6);
  assert.equal(current.music, false);
  assert.equal(Object.hasOwn(current, 'bogusKey'), false);
  assert.equal(current.portrait, true);

  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.volume, 0.3);
  assert.equal(saved.scale, 1.6);

  await instance.stop();

  const second = [];
  const again = await startCompanion({
    findTarget: async () => FAKE_TARGET,
    attach: async ({ getSettings }) => { second.push(getSettings()); return { async tick() {}, async close() {} }; },
    createNotifier: () => ({ accept: () => null }),
    playCue: async () => ({ ok: true }),
    settingsPath: file,
    pollMs: 5,
    sendTray: () => {},
    stopSounds,
  });
  await waitFor(() => second.length === 1);
  assert.equal(second[0].volume, 0.3);
  assert.equal(second[0].music, false);
  await again.stop();
});

test('a broken settings file falls back to defaults instead of blocking startup', async (t) => {
  const file = await settingsFile(t);
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, '{ not json');
  let settings = null;
  const instance = await startCompanion({
    findTarget: async () => FAKE_TARGET,
    attach: async ({ getSettings }) => { settings = getSettings(); return { async tick() {}, async close() {} }; },
    createNotifier: () => ({ accept: () => null }),
    playCue: async () => ({ ok: true }),
    settingsPath: file,
    pollMs: 5,
    sendTray: () => {},
    stopSounds,
  });
  await waitFor(() => settings !== null);
  assert.equal(settings.volume, 0.6);
  assert.equal(settings.portrait, true);
  await instance.stop();
});

test('tray messages are restricted to the fixed command set', async (t) => {
  const actions = [];
  const messages = [];
  const instance = await startCompanion({
    findTarget: async () => null,
    attach: async () => { throw new Error('unused'); },
    createNotifier: () => ({ accept: () => null }),
    playCue: async () => ({ ok: true }),
    settingsPath: await settingsFile(t),
    pollMs: 1000,
    sendTray: (message) => messages.push(message),
    onCommand: (action) => actions.push(action),
    runScript: async () => ({ stdout: '' }),
  });
  await instance.handleTray('pause');
  await instance.handleTray('resume');
  await instance.handleTray('open-settings');
  await instance.handleTray('run C:\\Windows\\System32\\cmd.exe /c calc');
  await instance.handleTray('{"action":"exec","path":"x"}');
  await instance.handleTray('quit');
  assert.deepEqual(actions, ['pause', 'resume', 'open-settings', 'quit']);

  instance.handleTray('quit');
  assert.equal(instance.state, 'stopped');
});

test('reconnects after a dropped connection without stacking sessions', async (t) => {
  const runtime = tracked();
  let failNext = true;
  const instance = await startCompanion({
    findTarget: async () => FAKE_TARGET,
    attach: async (options) => {
      if (failNext) { failNext = false; runtime.counts.connectionCount += 1; return { async tick() { throw new Error('CDP_CLOSED'); }, async close() {} }; }
      return runtime.attach(options);
    },
    createNotifier: () => runtime.notifier,
    playCue: runtime.playCue,
    settingsPath: await settingsFile(t),
    pollMs: 5,
    sendTray: () => {},
    stopSounds,
  });
  await waitFor(() => runtime.counts.connectionCount === 2);
  assert.equal(runtime.counts.activeConnections, 1);
  await instance.stop();
  assert.equal(runtime.counts.activeConnections, 0);
});

test('WinForms tray script parses and only exposes the fixed actions', async () => {
  const source = await readFile(new URL('../windows/tray.ps1', import.meta.url), 'utf8');
  assert.match(source, /NotifyIcon/);
  // The tray never starts a process: it reports fixed actions over stdout.
  assert.doesNotMatch(source, /Process\.Start|Start-Process|cmd\.exe|Invoke-Expression/);
  assert.match(source, /'暂停皮肤' 'pause'/);
  assert.match(source, /'显示设置' 'open-settings'/);
  assert.match(source, /'退出' 'quit'/);

  const { spawnSync } = await import('node:child_process');
  const { dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const scriptPath = join(dirname(dirname(fileURLToPath(import.meta.url))), 'windows', 'tray.ps1');
  const parse = spawnSync(process.env.POWERSHELL_EXE || 'powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    '$t=$null;$e=$null;[System.Management.Automation.Language.Parser]::ParseFile($env:EVA_SCRIPT_PATH,[ref]$t,[ref]$e)>$null; if ($e.Count -gt 0) { $e | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }',
  ], { encoding: 'utf8', env: { ...process.env, EVA_SCRIPT_PATH: scriptPath } });
  assert.equal(parse.status, 0, parse.stderr || parse.stdout);
});

test('a second companion on the same settings reports rather than attaching twice', async (t) => {
  const file = await settingsFile(t);
  let attaches = 0;
  const options = {
    findTarget: async () => FAKE_TARGET,
    attach: async () => { attaches += 1; return { async tick() {}, async close() {} }; },
    createNotifier: () => ({ accept: () => null }),
    playCue: async () => ({ ok: true }),
    settingsPath: file,
    pollMs: 50,
    stopSounds,
  };
  const messages = [];
  const first = await startCompanion({ ...options, sendTray: () => {} });
  await waitFor(() => attaches === 1);
  const second = await startCompanion({ ...options, sendTray: (message) => messages.push(message) });
  assert.equal(second.stopped, true);
  assert.ok(messages.some((m) => m.text === '伴生程序已在运行'));
  assert.equal(attaches, 1);
  await first.stop();

  const third = await startCompanion({ ...options, sendTray: () => {} });
  await waitFor(() => attaches === 2);
  await third.stop();
});

test('a stale lock left by a dead process is taken over', async (t) => {
  const file = await settingsFile(t);
  await writeFile(`${file}.lock`, '999999');
  let attached = false;
  const instance = await startCompanion({
    findTarget: async () => FAKE_TARGET,
    attach: async () => { attached = true; return { async tick() {}, async close() {} }; },
    createNotifier: () => ({ accept: () => null }),
    playCue: async () => ({ ok: true }),
    settingsPath: file,
    pollMs: 50,
    sendTray: () => {},
    stopSounds,
  });
  await waitFor(() => attached);
  await instance.stop();
  await assert.rejects(readFile(`${file}.lock`, 'utf8'), /ENOENT/);
});

test('the default discovery is asked for the configured debugging port', async (t) => {
  const seen = [];
  const instance = await startCompanion({
    findTarget: async (options) => { seen.push(options?.port ?? null); return null; },
    debugPort: 19327,
    attach: async () => { throw new Error('unused'); },
    createNotifier: () => ({ accept: () => null }),
    playCue: async () => ({ ok: true }),
    settingsPath: await settingsFile(t),
    pollMs: 5,
    sendTray: () => {},
    stopSounds,
  });
  await waitFor(() => seen.length >= 1);
  assert.equal(seen[0], 19327);
  await instance.stop();
});
