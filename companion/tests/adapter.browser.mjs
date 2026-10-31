import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { connectCdp } from '../src/cdp.mjs';
import { MCP_VIEW_V1 } from '../src/adapters/index.mjs';

// Runs in a real browser so visibility, timers and postMessage are the real ones.
// Requires EVA_BROWSER_ENDPOINT, same as client.browser.mjs.
test('quota adapter refreshes on visibility, honours throttling, and stops when hidden', { skip: !process.env.EVA_BROWSER_ENDPOINT }, async () => {
  const endpoint = process.env.EVA_BROWSER_ENDPOINT;
  const version = await fetch(`${endpoint}/json/version`).then((r) => r.json());
  const browser = await connectCdp(version.webSocketDebuggerUrl);
  let page;
  try {
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const targets = await fetch(`${endpoint}/json/list`).then((r) => r.json());
    page = await connectCdp(targets.find((t) => t.id === targetId).webSocketDebuggerUrl);
    const evaluate = async (expression) => {
      const result = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
      return result.result.value;
    };
    await page.send('Page.enable');
    await page.send('Page.setDocumentContent', {
      frameId: (await page.send('Page.getFrameTree')).frameTree.frame.id,
      html: '<html><body><main>workbench</main></body></html>',
    });

    // Count outbound quota requests; the host answers what the test enqueues.
    await evaluate(`
      window.__calls = [];
      window.__reply = {ok: true};
      window.electronBridge = {
        sendMessageFromView(payload) {
          window.__calls.push(payload.request.method);
          const reply = window.__reply;
          if (reply.never) return new Promise(() => {});
          setTimeout(() => {
            window.dispatchEvent(new MessageEvent('message', {
              data: reply.error
                ? {type:'mcp-response', message:{id: payload.request.id, error:{message:'LIMITED'}}}
                : {type:'mcp-response', message:{id: payload.request.id, result:{rateLimits:{primary:{usedPercent:20}}}}},
            }));
          }, 0);
          return Promise.resolve();
        },
      };
    `);
    // Regression: a tab that is hidden at load must still fetch once it becomes
    // visible, instead of waiting a full five-minute interval.
    await evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});");
    // The page only knows the method names the version adapter hands it.
    await evaluate(`window.__EVA_HOST__ = ${JSON.stringify(MCP_VIEW_V1)};`);
    const adapter = await readFile(new URL('../client/adapter.js', import.meta.url), 'utf8');
    await evaluate(adapter);
    await evaluate('new Promise(r=>setTimeout(r,30))');
    assert.equal(await evaluate('window.__calls.length'), 0, 'nothing fetched while hidden');
    await evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));");
    await evaluate('new Promise(r=>setTimeout(r,30))');
    await evaluate('new Promise(r=>setTimeout(r,30))');
    assert.equal(await evaluate('window.__calls.length'), 1, 'refreshes once on load');

    // The page has a page-scoped refresh entry for the skin's button.
    await evaluate('window.__evaQuota.refresh(); new Promise(r=>setTimeout(r,30))');
    assert.equal(await evaluate('window.__calls.length'), 2);

    // Hidden pages pause: no request is issued even when refresh is called.
    await evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));window.__evaQuota.refresh();new Promise(r=>setTimeout(r,30))");
    assert.equal(await evaluate('window.__calls.length'), 2, 'no request while hidden');

    // Coming back refreshes immediately.
    await evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));new Promise(r=>setTimeout(r,30))");
    assert.equal(await evaluate('window.__calls.length'), 3, 'refreshes when visible again');

    // Throttling hint pushes the next attempt far out: waiting a beat must not retry.
    await evaluate(`
      window.__calls.length = 0;
      window.__reply = {error: true};
      window.__evaQuota.refresh();
      new Promise(r=>setTimeout(r,40)).then(() => {
        window.dispatchEvent(new MessageEvent('message', {data:{type:'mcp-notification', method:'account/rateLimits/rateLimited', params:{retryAfterSeconds:120}}}));
      });
      new Promise(r=>setTimeout(r,80));
    `);
    assert.equal(await evaluate('window.__calls.length'), 1, 'the failed attempt only');
    await evaluate('new Promise(r=>setTimeout(r,150))');
    assert.equal(await evaluate('window.__calls.length'), 1, 'no retry before the server hint elapses');

    await evaluate(`
      window.dispatchEvent(new MessageEvent('message',{data:{type:'mcp-notification',method:'account/rateLimits/rateLimited',params:{retryAfterSeconds:120}}}));
      Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});
      document.dispatchEvent(new Event('visibilitychange'));
      window.__evaQuota.refresh();
      new Promise(r=>setTimeout(r,30));
    `);
    assert.equal(await evaluate('window.__calls.length'), 1, 'visibility and manual refresh must not bypass server backoff');

    // Dispose leaves nothing callable and drops late replies.
    await evaluate('window.__evaAdapter.dispose()');
    assert.equal(await evaluate("typeof window.__evaQuota + '/' + typeof window.__evaAdapter"), 'undefined/undefined');
    await browser.send('Target.closeTarget', { targetId });
  } finally {
    page?.close();
    browser.close();
  }
});
