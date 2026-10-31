import { connectCdp } from '../src/cdp.mjs';

/**
 * Opens a fresh page against the CDP endpoint in EVA_BROWSER_ENDPOINT.
 * Returns a small harness with evaluate/setHtml/click helpers and a close()
 * that tears down the page and the browser connection.
 */
export async function openPage(html = '') {
  const endpoint = process.env.EVA_BROWSER_ENDPOINT;
  const version = await fetch(`${endpoint}/json/version`).then((r) => r.json());
  const browser = await connectCdp(version.webSocketDebuggerUrl);
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const targets = await fetch(`${endpoint}/json/list`).then((r) => r.json());
  const page = await connectCdp(targets.find((t) => t.id === targetId).webSocketDebuggerUrl);

  const evaluate = async (expression) => {
    const result = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text || result.exceptionDetails.exception?.description);
    return result.result.value;
  };

  await page.send('Page.enable');
  const setHtml = async (content) => {
    await page.send('Page.setDocumentContent', {
      frameId: (await page.send('Page.getFrameTree')).frameTree.frame.id,
      html: content,
    });
  };
  if (html) await setHtml(html);

  return {
    page,
    evaluate,
    setHtml,
    resize: (width, height) => page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }),
    async close() {
      await browser.send('Target.closeTarget', { targetId }).catch(() => {});
      page.close();
      browser.close();
    },
  };
}

/** Where a point inside a selector is actually hit, for occlusion checks. */
export const hitTest = (selector) => `(()=>{
  const el=document.querySelector(${JSON.stringify(selector)});
  if(!el) return 'missing';
  const r=el.getBoundingClientRect();
  if(r.width===0||r.height===0) return 'zero-size';
  const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
  return top && (top===el || el.contains(top)) ? 'hit' : (top ? top.id || top.tagName.toLowerCase() : 'none');
})()`;
