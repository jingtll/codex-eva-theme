import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startCompanion } from '../src/main.mjs';
import { openPage } from './browser-harness.mjs';

test('real main, session and bundle connect, reload, pause, resume and clean up together', { skip: !process.env.EVA_BROWSER_ENDPOINT }, async t => {
  const page = await openPage('<html data-theme="dark"><body><textarea placeholder="输入消息"></textarea></body></html>');
  t.after(() => page.close());
  const dir = await mkdtemp(join(tmpdir(), 'eva-runtime-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const frame = (await page.page.send('Page.getFrameTree')).frameTree.frame.id;
  const targets = await fetch(`${process.env.EVA_BROWSER_ENDPOINT}/json/list`).then(r => r.json());
  const target = targets.find(target => target.id === frame);
  const host = `document.addEventListener('DOMContentLoaded',()=>{if(!document.querySelector('textarea')){const input=document.createElement('textarea');input.placeholder='输入消息';document.body.append(input)}});window.electronBridge={sendMessageFromView(value){if(value.type==='mcp-request')queueMicrotask(()=>window.postMessage({type:'mcp-response',message:{id:value.request.id,result:{rateLimits:{primary:{usedPercent:63}}}}},'*'))}}`;
  await page.page.send('Page.addScriptToEvaluateOnNewDocument', {source:host});
  await page.evaluate(host);
  const messages = [];
  const runtime = await startCompanion({
    findTarget: async () => target,
    fingerprint: '2cde1c59f255f5828fd97b93bf31eb988134c38c3bca8ef4e16e7fc255730fb1',
    settingsPath: join(dir, 'settings.json'), pollMs: 60000,
    createMediaBridge: () => ({read: async () => ({ok:false}), close() {}}),
    stopSounds: async () => {}, sendTray: message => messages.push(message),
  });
  t.after(() => runtime.stop());
  assert.ok(messages.some(message => message.text === '已连接'), JSON.stringify(messages));
  assert.equal(await page.evaluate('!!window.__codexEva'), true);
  await page.evaluate('new Promise(r=>setTimeout(r,30))');
  assert.match(await page.evaluate('document.querySelector("#codex-eva-root").shadowRoot.textContent'), /37%/);
  assert.ok(messages.some(message => /皮肤已加载/.test(message.text) && /额度已联动/.test(message.text)), 'status distinguishes transport, skin and host quota readiness');
  await runtime.updateSettings({volume:0.23});
  assert.match(messages.at(-1).text, /皮肤已加载/, 'saving preferences must not overwrite capability diagnostics');
  await page.page.send('Page.reload');
  for (let i=0;i<50;i++) {
    if (await page.evaluate('!!window.__codexEva').catch(()=>false)) break;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(await page.evaluate('!!window.__codexEva'), true, JSON.stringify(await page.evaluate('({html:document.body?.innerHTML,bridge:!!window.electronBridge,install:!!window.__evaInstall})')));
  assert.equal(await page.evaluate('window.__codexEva.getSettings().volume'), 0.23, 'reload keeps the settings saved after initial attachment');
  await runtime.pause();
  assert.equal(await page.evaluate('!!document.querySelector("#codex-eva-root")'), false);
  await runtime.resume();
  assert.equal(await page.evaluate('!!window.__codexEva'), true);
  await runtime.stop();
  assert.equal(await page.evaluate('!!window.__evaInstall || !!window.__evaHostEvent || !!window.__evaCommand'), false);
});
