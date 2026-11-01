import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectThemeTargets} from '../src/launch-ready.mjs';

const target=id=>({id,url:'app://-/index.html',type:'page',webSocketDebuggerUrl:`ws://127.0.0.1:19327/devtools/page/${id}`});
const inspect=pages=>inspectThemeTargets(Object.keys(pages).map(target),async url=>({
  send:async()=>({result:{value:pages[url.split('/').at(-1)]}}),close(){},
}));

test('readiness requires the visible workbench to have the theme, not a hidden duplicate',async()=>{
  assert.equal(await inspect({one:{visible:false,composer:true,skin:true},two:{visible:true,composer:true,skin:false}}),'theme_unavailable');
  assert.equal(await inspect({one:{visible:false,composer:true,skin:false},two:{visible:true,composer:true,skin:true}}),'ready');
  assert.equal(await inspect({one:{visible:false,composer:true,skin:true}}),'ready');
  assert.equal(await inspect({one:{visible:true,composer:false,skin:false}}),'waiting_for_workbench');
  assert.equal(await inspect({one:{visible:true,composer:true,skin:false}}),'theme_unavailable');
  assert.equal(await inspect({one:{visible:true,composer:true,skin:true},two:{visible:true,composer:true,skin:false}}),'theme_unavailable');
  assert.equal(await inspect({}),'endpoint_unavailable');
});
