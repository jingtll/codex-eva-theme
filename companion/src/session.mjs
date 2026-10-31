import {connectCdp} from './cdp.mjs';
import {classifyThread,mapNotification} from './host.mjs';
import {normalizeQuota} from './quota.mjs';

export async function attachSession(target,{bundle,media,notifier,getSettings,setSettings,playCue,onStatus=()=>{}}){
  const cdp=await connectCdp(target.webSocketDebuggerUrl,{timeoutMs:10000});
  let scriptId,disposed=false,visible=false,quota=null,pilot='asuka',sampling=false,mediaGeneration=0;
  const sources=new Map();let commandTail=Promise.resolve();
  let contextId=null;
  const frame=(await cdp.send('Page.getFrameTree')).frameTree.frame.id;
  const offContext=cdp.on('Runtime.executionContextCreated',({context})=>{if(context.auxData?.isDefault&&context.auxData.frameId===frame)contextId=context.id;});
  const offDestroyed=cdp.on('Runtime.executionContextsCleared',()=>{contextId=null;sources.clear();quota=null;});
  const evaluate=async expression=>{
    if(disposed)return;
    const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,...contextId?{contextId}:{}});
    if(result.exceptionDetails)throw Error('PAGE_SCRIPT_FAILED');
    return result.result.value;
  };
  const update=patch=>evaluate(`window.__codexEva?.updateState(${JSON.stringify(patch)})`).catch(()=>{});
  async function cue(kind,selected=pilot,preview=false){const s=getSettings();if(!preview&&(s.sound===false||s[kind==='approval'?'approvalSound':'completedSound']===false))return;await playCue({pilot:selected,kind,volume:s.volume??0.6});}
  async function command(value){
    if(value.action==='pilot'){if(['rei','asuka'].includes(value.pilot))pilot=value.pilot;}
    else if(value.action==='refresh')await evaluate('window.__evaAdapter?.refresh()');
    else if(value.action==='settings'){await setSettings(value.settings);await evaluate(`window.__codexEva?.setSettings(${JSON.stringify(getSettings())})`);if(getSettings().music===false){mediaGeneration++;media.close();}}
    else if(value.action==='cue'&&['approval','completed'].includes(value.kind))await cue(value.kind,pilot,true);
    else if(value.action==='media'&&['playpause','next','previous'].includes(value.command)){
      mediaGeneration++;await media.control(value.command,value.sourceId);await sampleMedia();
    }
  }
  async function host(value){
    if(value.type==='quota'){quota=normalizeQuota(value.payload);await update({quota,stale:false,status:'已连接'});}
    else if(value.type==='account-changed'){quota=null;await update({quota:null,stale:false,status:'账户已变化'});}
    else if(value.type==='quota-error')await update({stale:!!quota,status:'额度暂不可用'});
    else if(value.type==='thread-source'&&typeof value.threadId==='string'&&typeof value.hostId==='string'){
      const classification=classifyThread(value.source);if(classification!==null){sources.set(`${value.hostId}/${value.threadId}`,classification);if(sources.size>2000)sources.delete(sources.keys().next().value);}
    }else if(value.type==='notification'){
      const event=mapNotification(value,sources);const reminder=event&&notifier.accept(event);if(reminder)await cue(reminder.kind);
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
    syncSettings(patch){return evaluate(`window.__evaInstall?.(${JSON.stringify(patch)})`);},
    async tick(){visible=await evaluate('document.visibilityState==="visible" && !!window.__codexEva');await sampleMedia();},
    openSettings:()=>evaluate('window.__codexEva?.openSettings()'),
    async close(){
      if(disposed)return;mediaGeneration++;media.close();
      await evaluate('window.__evaInstaller?.disconnect();delete window.__evaInstaller;window.__evaAdapter?.dispose();window.__codexEva?.dispose();delete window.__EVA_ASSETS__;delete window.__EVA_CSS__;delete window.__EVA_SETTINGS__').catch(()=>{});
      if(scriptId)await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId}).catch(()=>{});
      disposed=true;offBinding();offContext();offDestroyed();cdp.close();
    },
  };
}
