import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { hitTest, openPage } from './browser-harness.mjs';

const fixture = await readFile(new URL('./fixtures/workbench.html', import.meta.url), 'utf8');
const skinCss = await readFile(new URL('../client/skin.css', import.meta.url), 'utf8');
const skinJs = await readFile(new URL('../client/skin.js', import.meta.url), 'utf8');

const ROOT = '#codex-eva-root';
const shadow = (selector) => `document.querySelector('${ROOT}').shadowRoot${selector ? `.querySelector('${selector}')` : '.textContent'}`;

async function mount(harness, { theme = 'dark' } = {}) {
  await harness.setHtml(fixture.replace('data-theme="dark"', `data-theme="${theme}"`));
  await harness.evaluate(`window.__EVA_ASSETS__={};window.__EVA_CSS__=${JSON.stringify(skinCss)};${skinJs}`);
}

test('装饰跟随可见工作台，避开侧栏、隐藏旧输入框和当前输入区', { skip: !process.env.EVA_BROWSER_ENDPOINT }, async () => {
  const harness=await openPage();
  try {
    const shellFixture=await readFile(new URL('./fixtures/workbench-shell.html',import.meta.url),'utf8');
    await harness.resize(1800,916);
    await harness.setHtml(shellFixture);
    await harness.evaluate(`window.__EVA_ASSETS__={};window.__EVA_CSS__=${JSON.stringify(skinCss)};${skinJs}`);
    for(const [width,panel] of [[1800,false],[1800,true],[1250,true],[900,false],[560,false]]){
      await harness.resize(width,916);
      await harness.evaluate(`document.querySelector('.aux').hidden=${!panel};new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
      const layout=await harness.evaluate(`(()=>{
        const root=document.querySelector('${ROOT}');const shadow=root.shadowRoot;
        const box=e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height}};
        return {root:box(root),main:box(document.querySelector('#active-workbench')),composer:box(document.querySelector('form')),portrait:box(shadow.querySelector('.portrait')),geometry:box(shadow.querySelector('.geometry')),rail:box(shadow.querySelector('.rail'))};
      })()`);
      const label=`${width}px, side panel ${panel}`;
      assert.ok(Math.abs(layout.root.left-layout.main.left)<1,`overlay starts at visible workbench: ${label}`);
      assert.ok(layout.root.right<=layout.main.right+1,`overlay ends at workbench: ${label}`);
      assert.ok(layout.root.bottom<=layout.composer.top,`overlay leaves composer clear: ${label}`);
      for(const name of ['portrait','geometry','rail']){
        assert.ok(layout[name].left>=layout.root.left-1,`${name} stays after sidebar: ${label}`);
        assert.ok(layout[name].right<=layout.root.right+1,`${name} stays before side panel: ${label}`);
      }
      assert.equal(await harness.evaluate(hitTest('#visible-editor')),'hit',`input remains clickable: ${label}`);
    }
    await harness.evaluate('window.__codexEva.dispose()');
    assert.equal(await harness.evaluate(`document.querySelector('${ROOT}')`),null);
  } finally { await harness.close(); }
});

test('双角色工作台：切换、设置、额度缺失、模态避让及卸载', { skip: !process.env.EVA_BROWSER_ENDPOINT }, async () => {
  const harness = await openPage();
  const { evaluate, page } = harness;
  try {
    await mount(harness);
    assert.equal(await evaluate(`document.querySelector('${ROOT}').dataset.pilot`), 'asuka');
    await evaluate('document.documentElement.dataset.theme="light";new Promise(r=>setTimeout(r,30))');
    assert.equal(await evaluate(`document.querySelector('${ROOT}').dataset.pilot`), 'rei');
    assert.match(await evaluate(shadow('')), /暂不可用/);
    await evaluate('window.__codexEva.updateState({quota:{buckets:[{id:"codex",name:"Codex",windows:[{id:"primary",name:"5 小时",remainingPercent:37,resetsAt:2000000000}]}],updatedAt:Date.now()}})');
    assert.match(await evaluate(shadow('')), /37%/);
    await evaluate('window.__codexEva.setSettings({backgroundStrength:0.2});window.__codexEva.openSettings()');
    // (the panel stays open for the checks below, then is closed before the
    // composer hit test: at narrow widths it sits above the composer)
    assert.equal(await evaluate(`${shadow('[data-settings]')}.hidden`), false);
    await evaluate('const d=document.createElement("dialog");d.id="host-dialog";document.body.append(d);d.showModal();new Promise(r=>setTimeout(r,40))');
    assert.equal(await evaluate(`document.querySelector('${ROOT}').hidden`), true);
    await evaluate('document.querySelector("#host-dialog").close();new Promise(r=>setTimeout(r,40))');
    assert.equal(await evaluate(`document.querySelector('${ROOT}').hidden`), false);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 850, deviceScaleFactor: 1, mobile: false });
    // Let the new viewport settle before measuring where a point lands.
    await evaluate('new Promise(r=>requestAnimationFrame(()=>setTimeout(r,50)))');
    // With constraints applied late the page can settle to a short layout (e.g. a
    // 484px viewport), pushing the composer below the fold. Scroll it into view
    // first, then check the overlay does not steal the click.
    await evaluate(`document.querySelector('#codex-eva-root').shadowRoot.querySelector('[data-settings]').hidden = true; new Promise(r=>setTimeout(r,30))`);
    await evaluate('document.querySelector("#approve").scrollIntoView({block:"nearest"})');
    assert.equal(await evaluate(hitTest('#approve')), 'hit');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#codex-eva-root")).pointerEvents'), 'none');
    await mkdir(new URL('../../.cache/screenshots/', import.meta.url), { recursive: true });
    const screenshot = await page.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(new URL('../../.cache/screenshots/eva-rei.png', import.meta.url), Buffer.from(screenshot.data, 'base64'));
    await evaluate('window.__codexEva.dispose()');
    assert.equal(await evaluate('document.querySelectorAll("#codex-eva-root").length'), 0);
    assert.equal(await evaluate('document.querySelector("#approve").disabled'), false);
  } finally {
    await harness.close();
  }
});

test('缩放、窄窗口与右侧面板开合后，输入与审批仍可操作', { skip: !process.env.EVA_BROWSER_ENDPOINT }, async () => {
  const harness = await openPage();
  const { evaluate } = harness;
  try {
    await mount(harness);
    for (const width of [1440, 1100, 900, 700, 560]) {
      await harness.resize(width, 860);
      await evaluate('new Promise(r=>requestAnimationFrame(()=>setTimeout(r,20)))');
      assert.equal(await evaluate(hitTest('#input')), 'hit', `composer hit at ${width}px`);
      assert.equal(await evaluate(hitTest('#approve')), 'hit', `approve hit at ${width}px`);
      // The overlay must stay inside the viewport; no horizontal scrollbar.
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `no overflow at ${width}px`);
    }

    // Page zoom: the overlay follows layout instead of a fixed pixel position.
    await harness.resize(1280, 860);
    for (const factor of [0.8, 1.25, 1.5]) {
      await evaluate(`document.body.style.zoom = '${factor}'; new Promise(r=>setTimeout(r,30))`);
      assert.equal(await evaluate(hitTest('#input')), 'hit', `composer hit at zoom ${factor}`);
      const inside = await evaluate(`(()=>{const r=document.querySelector('${ROOT}').getBoundingClientRect();return r.right<=innerWidth+1;})()`);
      assert.equal(inside, true, `overlay within viewport at zoom ${factor}`);
    }
    await evaluate('document.body.style.zoom = ""; new Promise(r=>setTimeout(r,30))');

    // At narrow widths the panel is placed bottom-left. It must span the width
    // between both edges: without a right edge it shrink-wrapped over the
    // composer below it, blocking the approve button (top-anchored layouts are
    // unaffected, so this has to be checked at the narrow width).
    // Checked at the narrow width where the panel's mobile placement applies.
    await harness.resize(560, 860);
    await evaluate('window.__codexEva.openSettings(); new Promise(r=>setTimeout(r,60))');
    const panel = await evaluate(`${shadow('[data-settings]')}.getBoundingClientRect().toJSON()`);
    const composer = await evaluate('document.querySelector("#approve").getBoundingClientRect().toJSON()');
    assert.ok(panel.height > 0, 'settings panel is laid out');
    assert.ok(panel.left > 0, `settings panel starts inside the viewport (left=${panel.left})`);
    assert.ok(panel.right <= 560, `settings panel ends inside the viewport (right=${panel.right})`);
    assert.equal(await evaluate(hitTest('#approve')), 'hit', 'approve stays clickable with settings open');
    assert.equal(await evaluate(hitTest('#input')), 'hit', 'composer stays clickable with settings open');
    await evaluate(`${shadow('[data-settings]')}.hidden = true; new Promise(r=>setTimeout(r,30))`);
    await harness.resize(1280, 860);
    await evaluate('new Promise(r=>setTimeout(r,60))');

    // Closing the right panel gives the thread more room; the rail still fits.
    await evaluate('document.querySelector("aside").remove(); new Promise(r=>setTimeout(r,30))');
    assert.equal(await evaluate(hitTest('#approve')), 'hit', 'approve hit without the right panel');
    assert.equal(await evaluate(hitTest('#input')), 'hit', 'composer hit without the right panel');

    // Widening the side panel must not push the overlay outside the window.
    await evaluate('const aside=document.createElement("aside");aside.id="wide";aside.style.width="420px";document.body.append(aside);new Promise(r=>setTimeout(r,30))');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'no overflow with a wide panel');
  } finally {
    await harness.close();
  }
});

test('设置面板里切换主题，皮肤颜色、机体编号与设置状态保持一致', { skip: !process.env.EVA_BROWSER_ENDPOINT }, async () => {
  const harness = await openPage();
  const { evaluate } = harness;
  try {
    await mount(harness);
    const unitOf = async () => await evaluate(`${shadow('.unit')}?.textContent`);
    const nameOf = async () => await evaluate(`${shadow('[data-name]')}?.textContent`);
    assert.deepEqual([await unitOf(), await nameOf()], ['02', '惣流 · 明日香']);

    await evaluate('document.documentElement.dataset.theme="light";new Promise(r=>setTimeout(r,30))');
    assert.deepEqual([await unitOf(), await nameOf()], ['00', '绫波丽']);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('${ROOT}')).getPropertyValue('--accent').trim()`), '#176b91');

    // Settings survive a theme switch: toggling a component off stays off.
    await evaluate('window.__codexEva.openSettings()');
    await evaluate(`(()=>{const i=${shadow('[data-setting="scanlines"]')};i.checked=false;i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await evaluate('document.documentElement.dataset.theme="dark";new Promise(r=>setTimeout(r,30))');
    assert.deepEqual([await unitOf(), await nameOf()], ['02', '惣流 · 明日香']);
    assert.equal(await evaluate(`${shadow('[data-setting="scanlines"]')}.checked`), false, 'scanline setting persists across themes');
    assert.equal(await evaluate(`${shadow('.scanlines')}.hidden`), true, 'scanlines stay hidden after switching back');
  } finally {
    await harness.close();
  }
});

test('主题由页面的实际 dataset.theme 决定，未知值按深色处理', { skip: !process.env.EVA_BROWSER_ENDPOINT }, async () => {
  const harness = await openPage();
  const { evaluate } = harness;
  try {
    await mount(harness, { theme: 'light' });
    assert.equal(await evaluate(`document.querySelector('${ROOT}').dataset.pilot`), 'rei');
    await evaluate('document.documentElement.dataset.theme="system";new Promise(r=>setTimeout(r,30))');
    assert.equal(await evaluate(`document.querySelector('${ROOT}').dataset.pilot`), 'asuka');
    await evaluate('delete document.documentElement.dataset.theme;new Promise(r=>setTimeout(r,30))');
    assert.equal(await evaluate(`document.querySelector('${ROOT}').dataset.pilot`), 'asuka');
  } finally {
    await harness.close();
  }
});
