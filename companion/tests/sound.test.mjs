import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { playCue, stopSounds } from '../src/sound.mjs';

const here = dirname(fileURLToPath(import.meta.url));

class FakeChild {
  constructor() {
    this.listeners = new Map();
    this.killed = false;
    queueMicrotask(() => this.emit('spawn'));
  }

  on(event, listener) {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  emit(event, value) {
    for (const listener of this.listeners.get(event) ?? []) listener(value);
  }

  kill() { this.killed = true; return true; }
}

function harness() {
  const calls = [];
  const spawn = (command, args, options) => {
    const child = new FakeChild();
    calls.push({ command, args, options, child });
    return child;
  };
  return { calls, spawn };
}

test('maps each supported pilot and event to one of the four local audio files', async () => {
  const { calls, spawn } = harness();
  const supported = [
    ['asuka', 'approval'],
    ['asuka', 'completed'],
    ['rei', 'approval'],
    ['rei', 'completed'],
  ];

  for (const [pilot, kind] of supported) {
    assert.deepEqual(await playCue({ pilot, kind, volume: 0.35, spawn }), { ok: true });
    const call = calls.at(-1);
    assert.equal(call.command, 'powershell.exe');
    assert.equal(call.options.windowsHide, true);
    assert.ok(call.args.includes('-STA'));
    assert.ok(call.args.includes(pilot));
    assert.ok(call.args.includes(kind));
    assert.ok(call.args.includes('0.35'));
    await stopSounds();
  }
  assert.equal(calls.length, 4);
});

test('rejects unsupported cues and invalid volume without spawning PowerShell', async () => {
  const { calls, spawn } = harness();
  assert.deepEqual(await playCue({ pilot: 'misato', kind: 'approval', spawn }), { ok: false, code: 'INVALID_CUE' });
  assert.deepEqual(await playCue({ pilot: 'rei', kind: 'denied', spawn }), { ok: false, code: 'INVALID_CUE' });
  assert.deepEqual(await playCue({ pilot: 'rei', kind: 'approval', volume: 1.1, spawn }), { ok: false, code: 'INVALID_VOLUME' });
  assert.deepEqual(await playCue({ pilot: 'rei', kind: 'approval', volume: Number.NaN, spawn }), { ok: false, code: 'INVALID_VOLUME' });
  assert.equal(calls.length, 0);
});

test('stopSounds terminates all outstanding cue processes', async () => {
  const { calls, spawn } = harness();
  assert.deepEqual(await playCue({ pilot: 'asuka', kind: 'approval', spawn }), { ok: true });
  assert.deepEqual(await playCue({ pilot: 'rei', kind: 'completed', spawn }), { ok: true });
  assert.equal(await stopSounds(), 2);
  assert.deepEqual(calls.map(({ child }) => child.killed), [true, true]);
  assert.equal(await stopSounds(), 0);
});

test('PowerShell sound player uses only WPF MediaPlayer and has no HTTP listener', async () => {
  const scriptPath = join(here, '..', 'windows', 'play-cue.ps1');
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /System\.Windows\.Media\.MediaPlayer/);
  assert.match(source, /\.Volume\s*=/);
  assert.match(source, /MediaOpened/);
  for (const filename of [
    'asuka-voice-approval.mp3', 'asuka-voice-complete.mp3',
    'rei-voice-approval.mp3', 'rei-voice-complete.mp3',
  ]) assert.ok(source.includes(filename));
  assert.doesNotMatch(source, /HttpListener|TcpListener|Start-Process/);
});
