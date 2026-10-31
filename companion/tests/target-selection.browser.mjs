import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openPage} from './browser-harness.mjs';
import {findCodexTarget} from '../src/discovery.mjs';
import {startCompanion} from '../src/main.mjs';

test('theme stays on the visible workbench across target reordering and window changes', {skip:!process.env.EVA_BROWSER_ENDPOINT}, async t=>{
  const hidden=await openPage('<textarea placeholder="输入"></textarea>');
  const visible=await openPage('<textarea placeholder="输入"></textarea>');
  t.after(()=>hidden.close());t.after(()=>visible.close());
  const setVisible=(page,value)=>page.evaluate(`window.electronBridge={sendMessageFromView(){}};Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>${JSON.stringify(value?'visible':'hidden')}});document.hasFocus=()=>false`);
  await setVisible(hidden,false);await setVisible(visible,true);
  const inventory=await fetch(`${process.env.EVA_BROWSER_ENDPOINT}/json/list`).then(r=>r.json());
  const targetOf=async page=>{
    const id=(await page.page.send('Page.getFrameTree')).frameTree.frame.id;
    return {...inventory.find(target=>target.id===id),url:'app://-/index.html'};
  };
  let targets=[await targetOf(hidden),await targetOf(visible)];
  const dir=await mkdtemp(join(tmpdir(),'eva-target-selection-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  let discoveries=0;
  const runtime=await startCompanion({
    settingsPath:join(dir,'settings.json'),pollMs:30,
    fingerprint:'2cde1c59f255f5828fd97b93bf31eb988134c38c3bca8ef4e16e7fc255730fb1',
    findTarget:options=>{discoveries++;return findCodexTarget({...options,port:19433,fetchImpl:async()=>({ok:true,json:async()=>targets})});},
    createMediaBridge:()=>({read:async()=>({ok:false}),close(){}}),stopSounds:async()=>{},sendTray:()=>{},
  });
  t.after(()=>runtime.stop());
  const mounted=page=>page.evaluate('!!window.__codexEva');
  assert.equal(await mounted(visible),true,'theme is on the visible chat');
  assert.equal(await mounted(hidden),false,'hidden renderer does not steal the skin');
  const before=discoveries;targets.reverse();
  for(let i=0;i<100&&discoveries<before+3;i++)await new Promise(r=>setTimeout(r,20));
  assert.ok(discoveries>=before+3,'several real discovery cycles completed');
  assert.equal(await mounted(visible),true,'theme survives repeated reordered inventories');
  await setVisible(hidden,true);await setVisible(visible,false);
  for(let i=0;i<100&&!await mounted(hidden);i++)await new Promise(r=>setTimeout(r,20));
  assert.equal(await mounted(hidden),true,'switching the visible window transfers the skin');
  assert.equal(await mounted(visible),false,'previous session is cleaned up');
});
