import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBundle} from '../src/bundle.mjs';
import {openPage} from './browser-harness.mjs';

test('设置页直接加载，并在聊天、图像和设置间切换时按范围显示皮肤', {skip:!process.env.EVA_BROWSER_ENDPOINT}, async()=>{
  const h=await openPage(`<html data-theme="light"><body style="margin:0"><nav data-app-navigation-rail><button data-sidebar-destination="builtin:home">Home</button><button data-sidebar-destination="builtin:images">Images</button></nav><nav><input id="settings-search"></nav><main data-app-shell-main-surface style="margin-left:300px;height:800px">Settings</main></body></html>`);
  try {
    await h.evaluate('window.electronBridge={}');
    await h.evaluate(await buildBundle());
    const settle=()=>h.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const shown=()=>h.evaluate(`(()=>{const r=document.querySelector('#codex-eva-root');return !!r&&!r.hidden&&getComputedStyle(r).display!=='none'&&r.getBoundingClientRect().width>0})()`);
    await settle();
    assert.equal(await shown(),true,'settings must load without a composer');
    await h.evaluate(`document.querySelector('#settings-search').remove();document.querySelector('[data-sidebar-destination="builtin:images"]').setAttribute('aria-current','page');document.querySelector('main').innerHTML='<textarea placeholder="image prompt"></textarea>'`);
    await settle();
    assert.equal(await shown(),false,'image prompt is not a chat composer');
    assert.equal(await h.evaluate('document.documentElement.hasAttribute("data-eva-pilot")'),false,'unsupported pages release injected colours');
    await h.evaluate(`document.querySelector('[aria-current]').removeAttribute('aria-current');document.querySelector('[data-sidebar-destination="builtin:home"]').setAttribute('aria-current','page');document.querySelector('main').innerHTML='<div contenteditable="true">Chat</div>'`);
    await settle();
    assert.equal(await shown(),true,'returning to chat restores the skin');
    await h.evaluate(`const d=document.createElement('dialog');d.id='modal';document.body.append(d);d.showModal()`);
    await settle();assert.equal(await shown(),false,'host dialog takes precedence');
    await h.evaluate(`document.querySelector('[aria-current]').removeAttribute('aria-current');document.querySelector('[data-sidebar-destination="builtin:images"]').setAttribute('aria-current','page');document.querySelector('#modal').close()`);
    await settle();assert.equal(await shown(),false,'closing a dialog must not reveal skin on images');
    await h.evaluate(`document.querySelector('nav:not([data-app-navigation-rail])').innerHTML='<input id="settings-search">';document.querySelector('main').innerHTML='Settings'`);
    await settle();assert.equal(await shown(),true,'settings returns after image view');
    assert.equal(await h.evaluate(`Math.round(document.querySelector('#codex-eva-root').getBoundingClientRect().left)`),300,'settings uses its content surface');
    await h.evaluate('window.__codexEva.dispose();window.__evaInstaller.disconnect()');
  } finally {await h.close();}
});
