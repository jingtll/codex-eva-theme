(() => {
  window.__evaAdapter?.dispose();
  const pending=new Map();let stopped=false;let next=0;let epoch=0;let refreshing=false;
  const emit = value => {try{window.__evaHostEvent(JSON.stringify(value));}catch{}};
  function request(method,params,hostId='local') {
    if(stopped)return Promise.reject(Error('CLOSED'));
    const id=`codex-eva:${crypto.randomUUID()}:${++next}`;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(Error('REQUEST_TIMEOUT'));},8000);
      pending.set(id,{resolve,reject,timer});
      window.electronBridge.sendMessageFromView({type:'mcp-request',hostId,request:{id,method,params}}).catch(()=>{clearTimeout(timer);pending.delete(id);reject(Error('SEND_FAILED'));});
    });
  }
  async function metadata(hostId,threadId) {
    if(typeof threadId!=='string')return;
    try {const result=await request('thread/read',{threadId,includeTurns:false},hostId);emit({type:'thread-source',hostId,threadId,source:result?.thread?.source});} catch{}
  }
  async function message(event) {
    if(event.source && event.source!==window)return;
    const data=event.data;if(!data||typeof data!=='object')return;
    if(data.type==='mcp-response' && pending.has(data.message?.id)) {
      event.stopImmediatePropagation();const item=pending.get(data.message.id);pending.delete(data.message.id);clearTimeout(item.timer);
      data.message.error?item.reject(Error('HOST_REQUEST_FAILED')):item.resolve(data.message.result);return;
    }
    if(data.type!=='mcp-notification'&&data.type!=='mcp-request')return;
    const method=data.method||data.request?.method;
    const params=data.params||data.request?.params||{};
    const hostId=data.hostId||'local';
    if(method==='account/updated'||method==='account/login/completed') {epoch++;emit({type:'account-changed'});refresh();return;}
    if(method==='account/rateLimits/updated') {epoch++;emit({type:'quota',payload:params});return;}
    if(method==='thread/started') {emit({type:'thread-source',hostId,threadId:params.thread?.id,source:params.thread?.source});return;}
    if(method!=='turn/completed'&&!method?.endsWith('/requestApproval')&&!method?.endsWith('/requestUserInput'))return;
    // Read metadata without turns. Never forward message content or tool arguments.
    await metadata(hostId,params.threadId);
    emit({type:'notification',hostId,method,params:{threadId:params.threadId,turnId:params.turnId,turn:params.turn?{id:params.turn.id,status:params.turn.status}:undefined}});
  }
  async function refresh() {
    if(stopped||refreshing||document.visibilityState==='hidden')return;
    refreshing=true;const generation=epoch;
    try {const payload=await request('account/rateLimits/read',null);if(generation===epoch)emit({type:'quota',payload});}
    catch {if(generation===epoch)emit({type:'quota-error'});}
    finally{refreshing=false;}
  }
  window.addEventListener('message',message,true);
  const visibility=()=>{if(document.visibilityState==='visible')refresh();};document.addEventListener('visibilitychange',visibility);
  const interval=setInterval(refresh,300000);
  window.__evaAdapter={refresh,dispose(){stopped=true;clearInterval(interval);window.removeEventListener('message',message,true);document.removeEventListener('visibilitychange',visibility);for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('CLOSED'));}pending.clear();delete window.__evaAdapter;}};
  refresh();
})();
