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
  assert.deepEqual(cdp.calls.filter(call=>call.method==='Runtime.removeBinding').map(call=>call.params.name), ['__evaCommand','__evaHostEvent']);
});

test('unknown thread sources report limited compatibility and do not play a cue', async () => {
  const cdp=fakeCdp(), statuses=[], cues=[];
  const session=await attach(cdp,{onStatus:text=>statuses.push(text),playCue:async cue=>cues.push(cue)});
  cdp.emit('Runtime.executionContextCreated', contextCreated(1));
  const emit=value=>cdp.emit('Runtime.bindingCalled',{name:'__evaHostEvent',executionContextId:1,payload:JSON.stringify(value)});
  emit({type:'thread-source',hostId:'local',threadId:'a',source:'future-client'});
  emit({type:'notification',hostId:'local',method:'turn/completed',params:{threadId:'a',turn:{id:'1',status:'completed'}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(statuses.some(text=>text.includes('未知聊天来源')));
  assert.equal(cues.length,0);
  await session.close();
});

test('closing a session waits for an in-flight preference save before uninstall can remove settings', async () => {
  const cdp=fakeCdp();
  let release,started;
  const saving=new Promise(resolve=>{release=resolve});
  const began=new Promise(resolve=>{started=resolve});
  const session=await attach(cdp,{setSettings:async()=>{started();await saving;}});
  cdp.emit('Runtime.executionContextCreated',contextCreated(1));
  cdp.emit('Runtime.bindingCalled',{name:'__evaCommand',executionContextId:1,payload:JSON.stringify({action:'settings',settings:{volume:0.2}})});
  await began;
  let closed=false;
  const closing=session.close().then(()=>{closed=true});
  await new Promise(resolve=>setImmediate(resolve));
  try { assert.equal(closed,false,'uninstall must wait until the pending save is drained'); }
  finally { release();await closing; }
});
