import test from 'node:test';
import assert from 'node:assert/strict';
import { attachSession } from '../src/session.mjs';

/** A stand-in CDP connection that records calls and lets a test fire events. */
function fakeCdp() {
  const listeners = new Map();
  const calls = [];
  const evaluated = [];
  let connected = true;
  return {
    calls,
    evaluated,
    send: async (method, params) => {
      calls.push({ method, params });
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main-frame' } } };
      if (method === 'Page.addScriptToEvaluateOnNewDocument') return { identifier: 'script-1' };
      if (method === 'Runtime.evaluate') return { result: { value: true } };
      return {};
    },
    on(method, listener) {
      if (!listeners.has(method)) listeners.set(method, new Set());
      listeners.get(method).add(listener);
      return () => listeners.get(method)?.delete(listener);
    },
    emit(method, params) {
      for (const listener of listeners.get(method) ?? []) listener(params);
    },
    close() { connected = false; },
    get connected() { return connected; },
  };
}

const settings = { volume: 0.4, portrait: true };

async function attach(cdp, hooks = {}) {
  return await attachSession(
    { webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/page/main' },
    {
      bundle: '/* bundle */',
      media: { read: async () => ({ ok: false }), close() {}, control: async () => ({}) },
      notifier: { accept: () => null },
      getSettings: () => settings,
      setSettings: async () => {},
      playCue: async () => ({ ok: true }),
      connectCdp: async () => cdp,
      ...hooks,
    },
  );
}

const contextCreated = (id) => ({
  context: { id, auxData: { isDefault: true, frameId: 'main-frame' } },
});

test('a reload re-dials the new context instead of evaluating into the destroyed one', async () => {
  const cdp = fakeCdp();
  let reloads = 0;
  const session = await attach(cdp, { onReload: () => { reloads += 1; } });

  cdp.emit('Runtime.executionContextCreated', contextCreated(1));
  assert.equal(reloads, 0, 'the first context after attach is not a reload');

  cdp.emit('Runtime.executionContextCreated', contextCreated(2));
  assert.equal(reloads, 1);

  cdp.evaluated.length = 0;
  await session.ensureMounted();
  const evaluateCalls = cdp.calls.filter((call) => call.method === 'Runtime.evaluate');
  assert.equal(evaluateCalls.at(-1).params.contextId, 2, 'later evaluates target the new context');
  await session.close();
});

test('a reload re-applies the current settings to the fresh page', async () => {
  const cdp = fakeCdp();
  const session = await attach(cdp);
  cdp.emit('Runtime.executionContextCreated', contextCreated(1));
  cdp.calls.length = 0;
  cdp.emit('Runtime.executionContextCreated', contextCreated(2));

  const injected = cdp.calls
    .filter((call) => call.method === 'Runtime.evaluate')
    .map((call) => call.params.expression)
    .find((expression) => expression.includes('__evaInstall'));
  assert.ok(injected, 'settings are pushed to the reloaded page');
  assert.match(injected, /0\.4/);
  await session.close();
});

test('contexts from other frames and non-default aux data are ignored', async () => {
  const cdp = fakeCdp();
  let reloads = 0;
  const session = await attach(cdp, { onReload: () => { reloads += 1; } });
  cdp.emit('Runtime.executionContextCreated', contextCreated(1));
  cdp.emit('Runtime.executionContextCreated', {
    context: { id: 5, auxData: { isDefault: true, frameId: 'plugin-iframe' } },
  });
  cdp.emit('Runtime.executionContextCreated', {
    context: { id: 6, auxData: { isDefault: false, frameId: 'main-frame' } },
  });
  assert.equal(reloads, 0);
  await session.close();
});

test('the session leaves no binding or script behind on close', async () => {
  const cdp = fakeCdp();
  const session = await attach(cdp);
  await session.close();
  assert.equal(cdp.connected, false);
  const removed = cdp.calls.find((call) => call.method === 'Page.removeScriptToEvaluateOnNewDocument');
  assert.deepEqual(removed.params, { identifier: 'script-1' });
});
