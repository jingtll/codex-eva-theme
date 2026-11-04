import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runtimeAdapter} from '../src/compatibility.mjs';
import {openPage} from './browser-harness.mjs';

test('unknown protocol ignores unsolicited and malformed messages before a correlated response', {skip:!process.env.EVA_BROWSER_ENDPOINT},async t=>{
  const page=await openPage('<html><body></body></html>');t.after(()=>page.close());
  const source=await readFile(new URL('../client/adapter.js',import.meta.url),'utf8');
  await page.evaluate(`window.__events=[];window.__evaHostEvent=s=>window.__events.push(JSON.parse(s));window.electronBridge={sendMessageFromView:p=>{window.__request=p.request}};window.__EVA_HOST__=${JSON.stringify(runtimeAdapter('a'.repeat(64)))};${source}`);
  const send=async message=>page.evaluate(`window.dispatchEvent(new MessageEvent('message',{data:${message}}));true`);
  await send(`{type:'mcp-notification',method:'account/rateLimits/updated',params:{rateLimits:{primary:{usedPercent:10}}}}`);
  await send(`{type:'mcp-response',message:{id:'unrelated',result:{}}}`);
  await send(`{type:'mcp-response',message:{id:window.__request.id,result:'malformed'}}`);
  assert.equal(await page.evaluate('window.__events.length'),0);
  await send(`{type:'mcp-response',message:{id:window.__request.id,result:{rateLimits:{primary:{usedPercent:10}}}}}`);
  await page.evaluate('new Promise(r=>setTimeout(r,10))');
  assert.equal(await page.evaluate('window.__events.some(e=>e.type==="compatibility"&&e.protocol===true)'),true);
  assert.equal(await page.evaluate('window.__events.some(e=>e.type==="quota")'),true);
  await page.evaluate('window.__evaAdapter.dispose();true');
});
