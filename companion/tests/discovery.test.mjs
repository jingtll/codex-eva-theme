import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { discoverCodexAsar, findCodexTarget, isCodexTarget } from '../src/discovery.mjs';

const MAIN_ORIGIN = 'app://-';

test('accepts only the confirmed main page target', () => {
  assert.equal(isCodexTarget({ type: 'page', url: 'app://-/index.html#/chat' }, MAIN_ORIGIN), true);
  assert.equal(isCodexTarget({ type: 'page', url: 'https://chatgpt.com/auth/login' }, MAIN_ORIGIN), false);
  assert.equal(isCodexTarget({ type: 'iframe', url: 'app://-/index.html' }, MAIN_ORIGIN), false);
  assert.equal(isCodexTarget({ type: 'page', url: 'app://-/plugins/example.html' }, MAIN_ORIGIN), false);
  assert.equal(isCodexTarget({ type: 'service_worker', url: 'app://-/index.html' }, MAIN_ORIGIN), false);
});

test('an explicit --asar path takes precedence without reading process command lines', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'eva-discovery-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const archivePath = join(dir, 'app.asar');
  await writeFile(archivePath, 'fixture');
  let processProviderCalled = false;

  const result = await discoverCodexAsar({
    argv: ['--asar', archivePath],
    platform: 'win32',
    processProvider: async () => {
      processProviderCalled = true;
      throw new Error('must not inspect processes');
    },
  });

  assert.equal(result.status, 'found');
  assert.equal(result.source, 'argument');
  assert.equal(result.asarPath, archivePath);
  assert.equal(processProviderCalled, false);
});

test('supports --asar=path and reports a missing value without echoing arguments', async () => {
  const missing = await discoverCodexAsar({ argv: ['--asar'], platform: 'win32' });
  assert.equal(missing.status, 'invalid_argument');
  assert.equal(JSON.stringify(missing).includes('--asar'), false);

  const inline = await discoverCodexAsar({
    argv: ['--asar=C:\\does-not-exist\\app.asar'],
    platform: 'win32',
  });
  assert.equal(inline.status, 'not_found');
});

test('discovers app.asar adjacent to the active ChatGPT.exe image path', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'eva-discovery-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const executable = join(dir, 'app', 'ChatGPT.exe');
  const archivePath = join(dir, 'app', 'resources', 'app.asar');
  await mkdir(dirname(archivePath), { recursive: true });
  await writeFile(archivePath, 'fixture');
  let provided = false;

  const result = await discoverCodexAsar({
    argv: [],
    platform: 'win32',
    processProvider: async () => {
      provided = true;
      return [{ executablePath: executable, fileVersion: '26.1.2.3' }];
    },
  });

  assert.equal(provided, true);
  assert.equal(result.status, 'found');
  assert.equal(result.source, 'process');
  assert.equal(result.asarPath, archivePath);
  assert.equal(result.fileVersion, '26.1.2.3');
  assert.equal(Object.hasOwn(result, 'commandLine'), false);
});

test('reports absence of a running process and rejects ambiguous active installations', async () => {
  const absent = await discoverCodexAsar({
    argv: [],
    platform: 'win32',
    processProvider: async () => [],
  });
  assert.equal(absent.status, 'process_not_found');

  const ambiguous = await discoverCodexAsar({
    argv: [],
    platform: 'win32',
    processProvider: async () => [
      { executablePath: 'C:\\one\\ChatGPT.exe', fileVersion: '1.0' },
      { executablePath: 'D:\\two\\ChatGPT.exe', fileVersion: '2.0' },
    ],
    exists: async (candidatePath) => [
      'c:\\one\\resources\\app.asar',
      'd:\\two\\resources\\app.asar',
    ].includes(candidatePath.toLowerCase()),
  });
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal(ambiguous.candidateCount, 2);
});

const listResponse = (targets) => ({ ok: true, json: async () => targets });
const TARGET = {
  id: 'main', type: 'page', url: 'app://-/index.html',
  webSocketDebuggerUrl: 'ws://127.0.0.1:19327/devtools/page/main',
};

test('selects only the confirmed main page over a loopback debugging socket', async () => {
  const requested = [];
  const result = await findCodexTarget({
    port: 19327,
    fetchImpl: async (url) => { requested.push(url); return listResponse([
      { id: 'login', type: 'page', url: 'https://chatgpt.com/auth/login', webSocketDebuggerUrl: 'ws://127.0.0.1:19327/devtools/page/login' },
      { id: 'plugin', type: 'iframe', url: 'app://-/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1:19327/devtools/page/plugin' },
      TARGET,
    ]); },
  });
  assert.deepEqual(requested, ['http://127.0.0.1:19327/json/list']);
  assert.equal(result.status, 'found');
  assert.equal(result.id, 'main');
  assert.equal(result.webSocketDebuggerUrl, TARGET.webSocketDebuggerUrl);
});

test('rejects a main page whose debugger socket is not loopback', async () => {
  const result = await findCodexTarget({
    port: 19327,
    fetchImpl: async () => listResponse([{ ...TARGET, webSocketDebuggerUrl: 'ws://10.0.0.5:19327/devtools/page/main' }]),
  });
  assert.equal(result.status, 'target_not_found');
});

test('reports an unreachable endpoint without throwing and ignores invalid ports', async () => {
  const unreachable = await findCodexTarget({ port: 19327, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  assert.equal(unreachable.status, 'endpoint_unavailable');
  assert.equal((await findCodexTarget({ port: 0 })).status, 'port_not_configured');
  assert.equal((await findCodexTarget()).status, 'port_not_configured');
});

test('visible workbench wins over a hidden renderer regardless of target order', async () => {
  const hidden={...TARGET,id:'hidden'}, visible={...TARGET,id:'visible'}, settings={...TARGET,id:'settings'};
  for(const targets of [[hidden,settings,visible],[visible,hidden,settings]]){
    const result=await findCodexTarget({port:19327,preferredTargetId:'hidden',fetchImpl:async()=>listResponse(targets),
      inspectTarget:async target=>({workbench:target.id!=='settings',visible:target.id!=='hidden',focused:target.id==='settings'})});
    assert.equal(result.id,'visible','the user-visible chat retains its theme instead of the hidden page');
  }
});

test('keeps a valid visible workbench stable and ignores failed auxiliary probes', async()=>{
  const targets=['other','current','failed'].map(id=>({...TARGET,id}));
  const result=await findCodexTarget({port:19327,preferredTargetId:'current',fetchImpl:async()=>listResponse(targets),
    inspectTarget:async target=>{if(target.id==='failed')throw Error('gone');return {workbench:true,visible:true,focused:false};}});
  assert.equal(result.id,'current');
});

test('a transient current-page probe failure does not move the theme to a hidden page',async()=>{
  const targets=['hidden','current'].map(id=>({...TARGET,id}));
  const result=await findCodexTarget({port:19327,preferredTargetId:'current',fetchImpl:async()=>listResponse(targets),
    inspectTarget:async target=>{if(target.id==='current')throw Error('temporary timeout');return {workbench:true,visible:false,focused:false};}});
  assert.equal(result.id,'current');
});
