import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeAdapter, readCapabilities, recordCapabilities, validQuota} from '../src/compatibility.mjs';

const fingerprint='a'.repeat(64);
test('unknown builds use a constrained runtime contract without claiming verification',()=>{
  const host=runtimeAdapter(fingerprint);
  assert.equal(host.runtimeProbe,true);
  assert.equal(host.methods.quotaRead,'account/rateLimits/read');
  assert.equal(runtimeAdapter(null).methods.quotaRead,undefined);
});
test('capability cache is versioned, bounded, expires, and contains only flags',()=>{
  const cache=recordCapabilities(null,fingerprint,{protocol:true,quota:false,secret:'discard'},100);
  assert.deepEqual(readCapabilities(cache,fingerprint,101),{protocol:true,quota:false});
  assert.equal(JSON.stringify(cache).includes('secret'),false);
  assert.equal(readCapabilities(cache,'b'.repeat(64),101),null);
  assert.equal(readCapabilities(cache,fingerprint,100+8*86400000),null);
  assert.equal(readCapabilities({...cache,schemaVersion:99},fingerprint,101),null);
  assert.equal(readCapabilities(cache,fingerprint,99),null);
  const refreshed=recordCapabilities(cache,fingerprint,{appearance:true},100+6*86400000);
  assert.equal(readCapabilities(refreshed,fingerprint,100+8*86400000),null,'appearance cannot renew old quota observations');
  let many=cache;
  for(let i=0;i<30;i++)many=recordCapabilities(many,i.toString(16).padStart(64,'0'),{protocol:true},200+i);
  assert.ok(Object.keys(many.builds).length<=8);
});
test('quota compatibility requires usable numeric windows, not merely an object',()=>{
  for(const p of [null,{}, {rateLimits:{primary:{usedPercent:'20'}}},{rateLimits:{primary:{usedPercent:101}}}])assert.equal(validQuota(p),false);
  assert.equal(validQuota({rateLimits:{primary:{usedPercent:20}}}),true);
});
