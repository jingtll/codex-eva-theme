import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMediaBridge } from '../src/media.mjs';

const here = dirname(fileURLToPath(import.meta.url));

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.writes = [];
    this.killed = false;
    this.stdin = {
      writable: true,
      write: (line) => { this.writes.push(String(line)); return true; },
      end: () => { this.stdin.writable = false; },
    };
  }

  respond(value) {
    this.stdout.emit('data', Buffer.from(`${JSON.stringify(value)}\n`, 'utf8'));
  }

  kill() {
    this.killed = true;
    this.emit('exit', 0, null);
    return true;
  }
}

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

function harness() {
  const calls = [];
  const spawn = (command, args, options) => {
    const child = new FakeChild();
    calls.push({ command, args, options, child });
    return child;
  };
  return { calls, spawn };
}

test('reads one JSON response from the Windows serve process', async () => {
  const { calls, spawn } = harness();
  const bridge = createMediaBridge({ spawn });
  try {
    const result = bridge.read();
    await nextTurn();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, 'powershell.exe');
    assert.equal(calls[0].args.at(-1), 'serve');
    assert.equal(calls[0].options.windowsHide, true);
    calls[0].child.stdout.emit('data', Buffer.from('startup noise\n', 'utf8'));
    calls[0].child.respond({ ok: true, source: 'system', playing: true, state: 'playing' });
    assert.deepEqual(await result, { ok: true, source: 'system', playing: true, state: 'playing' });
  } finally {
    bridge.close();
  }
});

test('serializes whitelisted controls and keeps the source id in the stdin field', async () => {
  const { calls, spawn } = harness();
  const bridge = createMediaBridge({ spawn });
  const sourceId = "player 'quoted'; $env:PATH; #";
  try {
    const reading = bridge.read();
    await nextTurn();
    const controlling = bridge.control('playpause', sourceId);
    await nextTurn();
    assert.deepEqual(calls[0].child.writes, ['read\n']);
    calls[0].child.respond({ ok: false, code: 'NO_MEDIA', playing: false, state: '' });
    assert.deepEqual(await reading, { ok: false, code: 'NO_MEDIA', playing: false, state: '' });
    await nextTurn();
    assert.deepEqual(calls[0].child.writes, ['read\n', `playpause\t${sourceId}\n`]);
    calls[0].child.respond({ ok: true, bundleId: sourceId });
    assert.deepEqual(await controlling, { ok: true, bundleId: sourceId });
  } finally {
    bridge.close();
  }
});

test('rejects unknown actions and delimiter-bearing source ids without writing requests', async () => {
  const { calls, spawn } = harness();
  const bridge = createMediaBridge({ spawn });
  assert.deepEqual(await bridge.control('launch', 'player'), { ok: false, code: 'ACTION' });
  assert.deepEqual(await bridge.control('next', 'player\tother'), { ok: false, code: 'SOURCE_ID' });
  assert.equal(calls.length, 0);
  bridge.close();
});

test('kills a timed out process and ignores its late response after recovery', async () => {
  const { calls, spawn } = harness();
  const bridge = createMediaBridge({ spawn, timeoutMs: 10 });
  const first = await bridge.read();
  assert.deepEqual(first, { ok: false, code: 'SYSTEM_MEDIA_UNAVAILABLE', playing: false, state: '' });
  assert.equal(calls[0].child.killed, true);

  const recovered = bridge.read();
  await nextTurn();
  assert.equal(calls.length, 2);
  calls[0].child.respond({ ok: true, state: 'stale' });
  let settled = false;
  recovered.then(() => { settled = true; });
  await nextTurn();
  assert.equal(settled, false);
  calls[1].child.respond({ ok: true, state: 'fresh' });
  assert.deepEqual(await recovered, { ok: true, state: 'fresh' });
  bridge.close();
});

test('returns an empty unavailable state when the bridge is closed or aborted', async () => {
  const { calls, spawn } = harness();
  const controller = new AbortController();
  const bridge = createMediaBridge({ signal: controller.signal, spawn });
  controller.abort();
  assert.deepEqual(await bridge.read(), { ok: false, code: 'ABORTED', playing: false, state: '' });
  assert.equal(calls.length, 0);

  const other = createMediaBridge({ spawn });
  other.close();
  assert.deepEqual(await other.read(), { ok: false, code: 'CLOSED', playing: false, state: '' });
});

test('PowerShell bridge returns a negative no-media state and maps play and pause methods', async () => {
  const source = await readFile(join(here, '..', 'windows', 'system-nowplaying.ps1'), 'utf8');
  assert.match(source, /play\s+=\s+'TryPlayAsync'/);
  assert.match(source, /pause\s+=\s+'TryPauseAsync'/);
  assert.match(source, /ok\s*=\s*\$false;\s*code\s*=\s*'NO_MEDIA'.*playing\s*=\s*\$false;\s*state\s*=\s*''/);
});
