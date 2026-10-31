import test from 'node:test';
import assert from 'node:assert/strict';
import {createLifecycle} from '../src/lifecycle.mjs';
test('没有客户端时不采样；暂停和退出释放当前连接',async()=>{
  let target=null,attached=0,closed=0,sampled=0;
  const loop=createLifecycle({findTarget:async()=>target,attach:async()=>{attached++;return{tick:async()=>{sampled++},close:async()=>{closed++}};}});
  await loop.tick();assert.equal(attached,0);assert.equal(sampled,0);
  target={id:'main'};await loop.tick();assert.equal(attached,1);assert.equal(sampled,1);
  await loop.pause();assert.equal(closed,1);await loop.tick();assert.equal(sampled,1);
  loop.resume();await loop.tick();assert.equal(attached,2);
  await loop.stop();await loop.tick();assert.equal(closed,2);assert.equal(attached,2);
});
test('目标改变时清理旧页面，停止与进行中的连接不竞争',async()=>{
  let resolveAttach,closed=0;
  const loop=createLifecycle({findTarget:async()=>({id:'a'}),attach:()=>new Promise(r=>{resolveAttach=r;})});
  const ticking=loop.tick();await new Promise(r=>setImmediate(r));
  const stopping=loop.stop();resolveAttach({close:async()=>{closed++}});await ticking;await stopping;
  assert.equal(closed,1);
});
