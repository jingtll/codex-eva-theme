/** Serializes connection discovery, sampling and teardown across pause/stop races. */
export function createLifecycle({findTarget,attach,onStatus=()=>{}}) {
  let current=null,paused=false,stopped=false,working=null;
  const disconnect=async()=>{const old=current;current=null;await old?.session.close();};
  async function tick(){
    if(stopped||paused)return;
    if(working)return working;
    working=(async()=>{
      try{
        const target=await findTarget();
        if(stopped||paused)return;
        if(!target){await disconnect();onStatus('等待 Codex 调试入口');return;}
        if(current?.id!==target.id){await disconnect();const session=await attach(target);if(stopped||paused){await session.close();return;}current={id:target.id,session};onStatus('已连接');}
        await current.session.tick?.();
      }catch(error){await disconnect();onStatus(error?.code==='ADAPTER_UNSUPPORTED'?error.message:'连接不可用，稍后重试');}
    })();
    try{await working;}finally{working=null;}
  }
  return {
    tick,
    // Wait for this call's work only, even when another tick was already in flight.
    async update(){await tick();},
    async pause(){paused=true;await working;await disconnect();onStatus('已暂停');},
    resume(){if(!stopped)paused=false;},
    async stop(){stopped=true;await working;await disconnect();},
    get paused(){return paused;},
    get stopped(){return stopped;},
    get connected(){return current!==null;},
  };
}
