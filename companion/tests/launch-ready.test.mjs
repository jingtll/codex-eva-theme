import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {inspectThemeTargets} from '../src/launch-ready.mjs';

const target=id=>({id,url:'app://-/index.html',type:'page',webSocketDebuggerUrl:`ws://127.0.0.1:19327/devtools/page/${id}`});
const inspect=pages=>inspectThemeTargets(Object.keys(pages).map(target),async url=>({
  send:async()=>({result:{value:pages[url.split('/').at(-1)]}}),close(){},
}));

test('readiness requires the visible workbench to have the theme, not a hidden duplicate',async()=>{
  assert.equal(await inspect({one:{visible:false,workbench:true,skin:true},two:{visible:true,workbench:true,skin:false}}),'theme_unavailable');
  assert.equal(await inspect({one:{visible:false,workbench:true,skin:false},two:{visible:true,workbench:true,skin:true}}),'ready');
  assert.equal(await inspect({one:{visible:false,workbench:true,skin:true}}),'ready');
  assert.equal(await inspect({one:{visible:true,workbench:false,skin:false}}),'waiting_for_workbench');
  assert.equal(await inspect({one:{visible:true,workbench:true,skin:false}}),'theme_unavailable');
  assert.equal(await inspect({one:{visible:true,workbench:true,skin:true},two:{visible:true,workbench:true,skin:false}}),'theme_unavailable');
  assert.equal(await inspect({}),'endpoint_unavailable');
});

test('a hidden composer or a page without the official bridge keeps waiting',async()=>{
  for(const [bridge,width,visibility] of [[true,100,'hidden'],[true,0,'visible'],[false,100,'visible']]) {
    const input={getBoundingClientRect:()=>({width,height:40})};
    const sandbox={window:{electronBridge:bridge},document:{visibilityState:'visible',hasFocus:()=>true,querySelector:()=>input,querySelectorAll:()=>[input]},getComputedStyle:()=>({visibility})};
    const result=await inspectThemeTargets([target('one')],async()=>({
      send:async(_method,{expression})=>({result:{value:runInNewContext(expression,sandbox)}}),close(){},
    }));
    assert.equal(result,'waiting_for_workbench');
  }
});
