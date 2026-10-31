import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {connectCdp} from '../src/cdp.mjs';

test('双角色工作台：切换、设置、额度缺失、模态避让及卸载', {skip: !process.env.EVA_BROWSER_ENDPOINT}, async () => {
  const endpoint = process.env.EVA_BROWSER_ENDPOINT;
  const version = await fetch(`${endpoint}/json/version`).then(r => r.json());
  const browser = await connectCdp(version.webSocketDebuggerUrl);
  let page;
  try {
    const {targetId} = await browser.send('Target.createTarget', {url: 'about:blank'});
    const targets = await fetch(`${endpoint}/json/list`).then(r => r.json());
    page = await connectCdp(targets.find(t => t.id === targetId).webSocketDebuggerUrl);
    const evaluate = async expression => {
      const result = await page.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
      if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
      return result.result.value;
    };
    await page.send('Page.enable');
    await page.send('Page.setDocumentContent', {frameId: (await page.send('Page.getFrameTree')).frameTree.frame.id,
      html: '<html data-theme="dark"><body><main><h1>项目工作台</h1><p>正在审阅代码与实现需求。</p><div contenteditable="true" role="textbox">输入消息</div><button id="approve">批准操作</button></main></body></html>'});
    const js = await readFile(new URL('../client/skin.js', import.meta.url), 'utf8');
    const css = await readFile(new URL('../client/skin.css', import.meta.url), 'utf8');
    // Three reasons to close the panel before the screenshot: it lives at the top
    // while the host theme is dark, and would otherwise show stale colours.
    await evaluate(`window.__EVA_ASSETS__={};window.__EVA_CSS__=${JSON.stringify(css)};${js}`);
    // Helper: reset the skin's own view, then set the panel exactly as asked.
    // Helper: open/close the panel the way a user does, through the shadow DOM buttons.
    const setPanel = async (open) => await evaluate(`(()=>{const root=document.querySelector('#codex-eva-root');const panel=root.shadowRoot.querySelector('[data-settings]');if(${open}){if(panel.hidden)window.__codexEva.openSettings();}else if(!panel.hidden){panel.querySelector('[data-action=close-settings]').click();}return true})()`);
    await setPanel(false);
    assert.equal(await evaluate('document.querySelector("#codex-eva-root").dataset.pilot'), 'asuka');
    await evaluate('document.documentElement.dataset.theme="light";new Promise(r=>setTimeout(r,30))');
    assert.equal(await evaluate('document.querySelector("#codex-eva-root").dataset.pilot'), 'rei');
    assert.match(await evaluate('document.querySelector("#codex-eva-root").shadowRoot.textContent'), /暂不可用/);
    await evaluate('window.__codexEva.updateState({quota:{buckets:[{id:"codex",name:"Codex",windows:[{id:"primary",name:"5 小时",remainingPercent:37,resetsAt:2000000000}]}],updatedAt:Date.now()}})');
    assert.match(await evaluate('document.querySelector("#codex-eva-root").shadowRoot.textContent'), /37%/);
    await evaluate('window.__codexEva.setSettings({backgroundStrength:0.2})');
    await setPanel(true);
    assert.equal(await evaluate('document.querySelector("#codex-eva-root").shadowRoot.querySelector("[data-settings]").hidden'), false);
    await evaluate('const d=document.createElement("dialog");d.id="host-dialog";document.body.append(d);d.showModal();new Promise(r=>setTimeout(r,40))');
    assert.equal(await evaluate('document.querySelector("#codex-eva-root").hidden'), true);
    await evaluate('document.querySelector("#host-dialog").close();new Promise(r=>setTimeout(r,40))');
    assert.equal(await evaluate('document.querySelector("#codex-eva-root").hidden'), false);
    await page.send('Emulation.setDeviceMetricsOverride', {width:700,height:850,deviceScaleFactor:1,mobile:false});
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    // The overlay must not steal clicks from the host page underneath it.
    const hit = await evaluate('(()=>{const r=document.querySelector("#approve").getBoundingClientRect();const el=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return el&&(el.id==="approve"||el.closest?.("#approve")!==null);})()');
    assert.equal(hit, true);
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#codex-eva-root")).pointerEvents'), 'none');
    // Screenshot the workbench itself: the settings panel is covered above, and
    // open it would hide the rail behind stale colours.
    await setPanel(false);
    await evaluate('new Promise(r=>setTimeout(r,50))');
    await mkdir(new URL('../../.cache/screenshots/', import.meta.url), {recursive:true});
    const screenshot = await page.send('Page.captureScreenshot', {format:'png'});
    await writeFile(new URL('../../.cache/screenshots/eva-rei.png', import.meta.url), Buffer.from(screenshot.data,'base64'));
    await evaluate('window.__codexEva.dispose()');
    assert.equal(await evaluate('document.querySelectorAll("#codex-eva-root").length'), 0);
    assert.equal(await evaluate('document.querySelector("#approve").disabled'), false);
    await browser.send('Target.closeTarget', {targetId});
  } finally {page?.close(); browser.close();}
});
