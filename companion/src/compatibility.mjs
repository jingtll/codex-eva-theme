import {MCP_VIEW_V1} from './adapters/index.mjs';
import {normalizeQuota} from './quota.mjs';

const HASH=/^[a-f0-9]{64}$/;
const FLAGS=['appearance','protocol','quota','events'];
const MAX_AGE=7*86400000;
const flags=value=>Object.fromEntries(FLAGS.filter(k=>typeof value?.[k]==='boolean').map(k=>[k,value[k]]));

// A candidate contract, never a claim that an unknown build was verified.
export function runtimeAdapter(fingerprint, cached=null) {
  return {...MCP_VIEW_V1,id:'runtime-probe-v1',runtimeProbe:true,
    methods:HASH.test(fingerprint||'')?MCP_VIEW_V1.methods:{},
    cachedCapabilities:flags(cached)};
}

export function readCapabilities(cache,fingerprint,now=Date.now()) {
  if(cache?.schemaVersion!==1||!HASH.test(fingerprint||''))return null;
  const item=cache.builds?.[fingerprint];
  if(!Number.isFinite(item?.checkedAt)||now<item.checkedAt||now-item.checkedAt>MAX_AGE)return null;
  return flags(item.capabilities);
}

export function recordCapabilities(cache,fingerprint,patch,now=Date.now()) {
  const builds={};
  if(cache?.schemaVersion===1&&cache.builds&&typeof cache.builds==='object'){
    for(const key of Object.keys(cache.builds)){
      const value=readCapabilities(cache,key,now);
      if(value)builds[key]={checkedAt:cache.builds[key].checkedAt,capabilities:value};
    }
  }
  if(HASH.test(fingerprint||''))builds[fingerprint]={checkedAt:now,capabilities:{...builds[fingerprint]?.capabilities,...flags(patch)}};
  return {schemaVersion:1,builds:Object.fromEntries(Object.entries(builds).sort((a,b)=>b[1].checkedAt-a[1].checkedAt).slice(0,8))};
}

export function validQuota(payload) {
  const windows=normalizeQuota(payload).buckets.flatMap(b=>b.windows);
  return windows.length>0&&windows.every(w=>Number.isFinite(w.usedPercent)&&w.usedPercent>=0&&w.usedPercent<=100);
}
