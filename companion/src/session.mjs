import {connectCdp as defaultConnectCdp} from './cdp.mjs';
import {classifyThread,mapNotification} from './host.mjs';
import {normalizeQuota} from './quota.mjs';

export async function attachSession(target,{bundle,media,notifier,getSettings,setSettings,playCue,onStatus=()=>{},onReload=()=>{},connectCdp=defaultConnectCdp}){
  const cdp=await connectCdp(target.webSocketDebuggerUrl,{timeoutMs:10000});
  let scriptId,disposed=false,visible=false,quota=null,pilot='asuka',sampling=false,mediaGeneration=0;
  let mounted=false,quotaStatus='待验证',eventStatus='待验证',lastStatus='';
  function reportStatus(){
    const text=`连接成功 · ${mounted?'皮肤已加载':'等待工作台'} · 额度${quotaStatus} · 事件${eventStatus}`;
    if(text!==lastStatus){lastStatus=text;onStatus(text);}
  }
  const sources=new Map();let commandTail=Promise.resolve(),closing=null;
  let contextId=null,hadContext=false;
  const frame=(await cdp.send('Page.getFrameTree')).frameTree.frame.id;
  // A navigation (Ctrl+R, host reload) discards the old default context and
  // creates a new one. Page.addScriptToEvaluateOnNewDocument already re-runs the
  // bundle for the new document, so this handler re-dials the new context, tells
  // the page which settings are current, and reports a reload to the caller.
  // Without it, evaluate() would keep targeting the destroyed context until the
  // target id changed and the lifecycle reconnected, leaving the page bare.
  let reloads=0;
  const offContext=cdp.on('Runtime.executionContextCreated',({context})=>{
    if(!(context.auxData?.isDefault&&context.auxData.frameId===frame))return;
    const first=!hadContext;hadContext=true;contextId=context.id;
    if(first)return;
    reloads+=1;
    evaluate(`window.__EVA_SETTINGS__=${JSON.stringify(getSettings())};window.__evaInstall?.(window.__EVA_SETTINGS__)`).catch(()=>{});
    onReload();
  });
  const offDestroyed=cdp.on('Runtime.executionContextsCleared',()=>{contextId=null;sources.clear();quota=null;});
  const evaluate=async expression=>{
    if(disposed)return;
    const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,...contextId?{contextId}:{}});
    if(result.exceptionDetails)throw Error('PAGE_SCRIPT_FAILED');
    return result.result.value;
  };
  const update=patch=>evaluate(`window.__codexEva?.updateState(${JSON.stringify(patch)})`).catch(()=>{});
  async function cue(kind,selected=pilot,preview=false){if(closing||disposed)return;const s=getSettings();if(!preview&&(s.sound===false||s[kind==='approval'?'approvalSound':'completedSound']===false))return;await playCue({pilot:selected,kind,volume:s.volume??0.6});}
  async function command(value){
    if(closing||disposed)return;
    if(value.action==='pilot'){if(['rei','asuka'].includes(value.pilot))pilot=value.pilot;}
    else if(value.action==='refresh')await evaluate('window.__evaQuota?.refresh()');
    else if(value.action==='settings'){await setSettings(value.settings);await evaluate(`window.__codexEva?.setSettings(${JSON.stringify(getSettings())})`);if(getSettings().music===false){mediaGeneration++;media.suspend?.();await update({media:null});}}
    else if(value.action==='cue'&&['approval','completed'].includes(value.kind))await cue(value.kind,pilot,true);
    else if(value.action==='media'&&['playpause','next','previous'].includes(value.command)){
      mediaGeneration++;await media.control(value.command,value.sourceId);await sampleMedia();
    }
  }
  async function host(value){
    if(closing||disposed)return;
    if(value.type==='quota'){quota=normalizeQuota(value.payload);quotaStatus=quota.buckets.length?'已联动':'暂不可用';reportStatus();await update({quota,stale:false,status:'已连接'});}
    else if(value.type==='account-changed'){quota=null;quotaStatus='待验证';eventStatus='待验证';sources.clear();reportStatus();await update({quota:null,stale:false,status:'账户已变化'});}
    else if(value.type==='quota-error'){quotaStatus='暂不可用';reportStatus();await update({stale:!!quota,status:'额度暂不可用'});}
    else if(value.type==='thread-source'&&typeof value.threadId==='string'&&typeof value.hostId==='string'){
      const key=`${value.hostId}/${value.threadId}`;
      const classification=classifyThread(value.source);
      if(classification!==null){sources.set(key,classification);if(sources.size>2000)sources.delete(sources.keys().next().value);}
      else {sources.delete(key);eventStatus='兼容受限：未知聊天来源';reportStatus();}
    }else if(value.type==='notification'){
      const event=mapNotification(value,sources);const reminder=event&&notifier.accept(event);
      if(event){eventStatus='已观测（覆盖待验收）';reportStatus();}
      if(reminder)await cue(reminder.kind);
    }
  }
  const offBinding=cdp.on('Runtime.bindingCalled',event=>{
    if(disposed||event.executionContextId!==contextId||event.payload.length>1024*1024)return;
    let value;try{value=JSON.parse(event.payload);}catch{return;}
    if(!value||typeof value!=='object')return;
    if(event.name==='__evaCommand')commandTail=commandTail.then(()=>command(value)).catch(()=>onStatus('组件操作失败'));
    else if(event.name==='__evaHostEvent')host(value).catch(()=>onStatus('宿主数据暂不可用'));
  });
  async function sampleMedia(){
    if(sampling||disposed||!visible||getSettings().music===false)return;
    sampling=true;const generation=mediaGeneration;
    try{const result=await media.read();if(!disposed&&generation===mediaGeneration)await update({media:result.ok?{available:true,sourceId:result.app,title:result.title,artist:result.artist,playing:result.playing}:null});}
    finally{sampling=false;}
  }
  try{
    await cdp.send('Page.enable');await cdp.send('Runtime.enable');
    await cdp.send('Runtime.addBinding',{name:'__evaCommand'});await cdp.send('Runtime.addBinding',{name:'__evaHostEvent'});
    scriptId=(await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:bundle})).identifier;
    await evaluate(bundle);
  }catch(error){offContext();offDestroyed();offBinding();cdp.close();throw error;}
  return {
    syncSettings(patch){return evaluate(`window.__codexEva?.setSettings(${JSON.stringify(patch)})`);},
    // Re-injects the bundle if the page lost it (e.g. the composer was not yet
    // present when the new document loaded). Cheap when the skin is mounted.
    async ensureMounted(){if(disposed)return;await evaluate('(()=>{if(!window.__codexEva&&window.__evaInstall)window.__evaInstall()})()');},
    async tick(){
      const view=await evaluate('({visible:document.visibilityState==="visible",mounted:!!window.__codexEva})');
      mounted=view===true||view?.mounted===true;visible=mounted&&(view===true||view?.visible===true);
      reportStatus();await sampleMedia();
    },
    get reloads(){return reloads;},
    openSettings:()=>evaluate('window.__codexEva?.openSettings()'),
    async close(){
      if(closing)return closing;
      closing=(async()=>{
      await commandTail;
      if(disposed)return;mediaGeneration++;media.close();
      await evaluate('window.__evaInstaller?.disconnect();delete window.__evaInstaller;window.__evaAdapter?.dispose();window.__codexEva?.dispose();delete window.__evaInstall;delete window.__EVA_HOST__;delete window.__EVA_ASSETS__;delete window.__EVA_CSS__;delete window.__EVA_SETTINGS__').catch(()=>{});
      if(scriptId)await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId}).catch(()=>{});
      for(const name of ['__evaCommand','__evaHostEvent']){
        await cdp.send('Runtime.removeBinding',{name}).catch(()=>{});
        await evaluate(`delete window.${name}`).catch(()=>{});
      }
      disposed=true;offBinding();offContext();offDestroyed();cdp.close();
      })();
      return closing;
    },
  };
}
