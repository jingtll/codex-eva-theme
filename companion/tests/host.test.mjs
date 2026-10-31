import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyThread, mapNotification} from '../src/host.mjs';
test('只把明确来源的主聊天标记为主聊天，未知来源保持未知',()=>{
  assert.equal(classifyThread('appServer'),false);
  assert.equal(classifyThread({subAgent:{threadSpawn:{parentThreadId:'a'}}}),true);
  assert.equal(classifyThread(undefined),null);
});
test('主聊天实时完成映射与额度推送保持独立，不发送正文',()=>{
  const source=new Map([['local/a',false]]);
  const mapped=mapNotification({hostId:'local',method:'turn/completed',params:{threadId:'a',turn:{id:'1',status:'completed',items:[{text:'private'}]}}},source);
  assert.deepEqual(mapped,{hostId:'local',threadId:'a',turnId:'1',type:'completed',status:'completed',isSubagent:false,replay:false});
  assert.equal(mapNotification({method:'turn/completed',params:{threadId:'b',turn:{id:'1',status:'completed'}}},source),null);
});
