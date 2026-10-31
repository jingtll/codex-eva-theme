(() => {
  'use strict';
  window.__codexEva?.dispose();
  const defaults = {backgroundStrength:0.18, scale:1, portrait:true, geometry:true, scanlines:true, clock:true, quota:true, music:true, sound:true, approvalSound:true, completedSound:true, volume:0.6};
  let settings = {...defaults, ...window.__EVA_SETTINGS__};
  let state = {quota:null, media:null, status:'已连接', stale:false};
  const assets = window.__EVA_ASSETS__ || {};
  const root = document.createElement('div'); root.id = 'codex-eva-root';
  const shadow = root.attachShadow({mode:'open'});
  const style = document.createElement('style'); style.textContent = window.__EVA_CSS__ || '';
  shadow.append(style);
  const shell = document.createElement('div'); shell.className='shell';
  shell.innerHTML = `<div class="scanlines" aria-hidden="true"></div><div class="geometry" aria-hidden="true"><span class="unit">02</span><span class="unit-label">EVANGELION / TEST TYPE</span></div><img class="portrait" alt="" aria-hidden="true"><div class="rail"><header class="pilot"><img class="logo" alt="NERV"><div><small>PERSONAL CONTROL SYSTEM</small><strong data-name></strong><span data-status></span></div><button data-action="settings" title="显示设置" aria-label="显示设置">⚙</button></header><section class="card clock"><div class="caption">時刻管制 <span>LOCAL TIME</span></div><time data-clock></time><div class="clock-meta" data-date></div></section><section class="card quota"><div class="caption">残存稼働限界 <span>ACCOUNT QUOTA</span></div><div data-quota></div><div class="quota-footer"><span data-updated></span><button data-action="refresh" aria-label="刷新额度">↻</button></div><details><summary>额度详情</summary><div data-quota-detail></div></details></section><section class="card music" hidden><div class="caption">音声管制 <span>NOW PLAYING</span></div><strong data-track></strong><div class="muted" data-artist></div><div class="controls"><button data-action="previous" aria-label="上一首">◀</button><button data-action="playpause" aria-label="播放或暂停">Ⅱ / ▶</button><button data-action="next" aria-label="下一首">▶</button></div></section></div><section class="settings card" data-settings hidden aria-label="显示设置"><div class="caption">表示設定 <button data-action="close-settings" aria-label="关闭显示设置">×</button></div><div data-fields></div><div class="controls"><button data-action="test-approval">试听审核</button><button data-action="test-completed">试听完成</button></div><button data-action="reset">恢复全部默认</button></section>`;
  shadow.append(shell); document.body.append(root);
  const $ = selector => shadow.querySelector(selector);
  const text = (selector,value) => {$(selector).textContent = String(value ?? '');};
  const send = (action, data={}) => {try {window.__evaCommand?.(JSON.stringify({action,...data}));} catch {text('[data-status]','本机连接不可用');}};
  let pilot = 'asuka'; let disposed=false;
  const palette = document.createElement('style'); palette.id='codex-eva-colors';
  palette.textContent = `html[data-eva-pilot="asuka"] {--color-background-primary:#0d0f13;--color-background-secondary:#14171c;--color-text:#fff1e7;--color-text-primary:#fff1e7;--color-text-secondary:#c6b7ac;--color-text-emphasis:#ff354d;--color-border:#ff354d38;--color-border-strong:#ff354d70;} html[data-eva-pilot="rei"] {--color-background-primary:#eff6fa;--color-background-secondary:#f7fbfd;--color-text:#203849;--color-text-primary:#203849;--color-text-secondary:#476173;--color-text-emphasis:#176b91;--color-border:#176b9138;--color-border-strong:#176b9170;}`;
  document.head.append(palette);
  const labels = {portrait:'角色线稿',geometry:'机体纹样',scanlines:'扫描线',clock:'时钟',quota:'剩余额度',music:'音乐控制',sound:'角色提示音',approvalSound:'待审核提示',completedSound:'正常完成提示'};
  for (const [key,label] of Object.entries(labels)) {
    const row = document.createElement('label'); const input=document.createElement('input');input.type='checkbox';input.dataset.setting=key;
    row.append(document.createTextNode(label),input); $('[data-fields]').append(row);
  }
  for (const [key,label,min,max,step] of [['backgroundStrength','背景强度',0,0.5,0.01],['scale','组件大小',0.6,1.6,0.05],['volume','提示音量',0,1,0.05]]) {
    const row=document.createElement('label');const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;input.dataset.setting=key;row.append(document.createTextNode(label),input);$('[data-fields]').append(row);
  }
  function applySettings(patch={}) {
    for (const key of Object.keys(defaults)) if (Object.hasOwn(patch,key)) {
      const v=patch[key];
      if (typeof defaults[key]==='boolean' && typeof v==='boolean') settings[key]=v;
      if (typeof defaults[key]==='number' && Number.isFinite(v)) {
        const ranges={backgroundStrength:[0,0.5],scale:[0.6,1.6],volume:[0,1]};
        const [min,max]=ranges[key];settings[key]=Math.max(min,Math.min(max,v));
      }
    }
    root.style.setProperty('--strength',settings.backgroundStrength);
    root.style.setProperty('--scale',settings.scale);
    for (const key of ['portrait','geometry','scanlines','clock','quota']) $('.'+key).hidden=!settings[key];
    $('.music').hidden=!settings.music || !state.media?.available;
    shadow.querySelectorAll('[data-setting]').forEach(input=>{const v=settings[input.dataset.setting];if(input.type==='checkbox')input.checked=v;else input.value=v;});
  }
  function theme() {
    pilot = document.documentElement.dataset.theme==='light' ? 'rei' : 'asuka';
    root.dataset.pilot=pilot;document.documentElement.dataset.evaPilot=pilot;
    text('[data-name]',pilot==='asuka'?'惣流 · 明日香':'绫波丽');
    text('.unit',pilot==='asuka'?'02':'00');
    text('.unit-label',pilot==='asuka'?'EVANGELION / TEST TYPE':'EVANGELION / PROTOTYPE');
    $('.portrait').src=assets[pilot+'Portrait']||'';$('.portrait').style.visibility=assets[pilot+'Portrait']?'visible':'hidden';
    $('.logo').src=assets.logo||'';$('.logo').style.visibility=assets.logo?'visible':'hidden';
    send('pilot',{pilot});
  }
  function clock() {
    const now=new Date();text('[data-clock]',now.toLocaleTimeString('en-GB',{hour12:false}));
    text('[data-date]',`${now.toLocaleDateString('zh-CN')}  /  ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  }
  function countdown(seconds) {
    if (!Number.isFinite(seconds)) return '重置时间未知';
    const remaining=Math.max(0,Math.ceil(seconds-Date.now()/1000));
    if (!remaining) return '等待额度更新';
    return `${Math.floor(remaining/3600)}h ${Math.floor(remaining%3600/60)}m 后重置`;
  }
  function renderQuota() {
    const host=$('[data-quota]');host.replaceChildren();
    const buckets=Array.isArray(state.quota?.buckets)?state.quota.buckets:[];
    if (!buckets.length) {host.textContent='暂不可用';text('[data-updated]','账户共享额度');text('[data-quota-detail]','等待宿主返回额度数据');return;}
    const details=[];
    for (const bucket of buckets) for (const win of bucket.windows||[]) {
      const row=document.createElement('div');row.className='quota-row';
      const title=document.createElement('span');title.textContent=`${bucket.name||bucket.id} · ${win.name||win.id}`;
      const remaining=typeof win.remainingPercent==='number'&&Number.isFinite(win.remainingPercent)?Math.max(0,Math.min(100,win.remainingPercent)):null;
      const value=document.createElement('strong');value.textContent=remaining===null?'暂不可用':`${Math.round(remaining)}%`;
      const bar=document.createElement('div');bar.className='meter';const fill=document.createElement('i');fill.style.width=`${remaining??0}%`;bar.append(fill);
      const reset=document.createElement('small');reset.textContent=countdown(win.resetsAt);row.append(title,value,bar,reset);host.append(row);
      details.push(`${title.textContent}：${Number.isFinite(win.resetsAt)?new Date(win.resetsAt*1000).toLocaleString():'重置时间未知'}`);
    }
    text('[data-quota-detail]',details.join('\n'));
    text('[data-updated]',`${state.stale?'已过期 · ':''}更新 ${new Date(state.quota.updatedAt).toLocaleTimeString('en-GB')} · 账户共享`);
  }
  function updateState(patch={}) {
    if (disposed) return;
    state={...state,...patch};text('[data-status]',state.status);
    renderQuota();
    const media=state.media;
    $('.music').hidden=!settings.music||!media?.available;
    text('[data-track]',media?.title||'');text('[data-artist]',media?.artist||'');
  }
  function hostModal() {
    // A hidden root would otherwise keep covering the page: an element with
    // display:none still receives hit tests, and inside a shadow tree the hit
    // reports the host, so the host page's clicks would be swallowed.
    root.hidden=!!document.querySelector('dialog[open], [aria-modal="true"][role="dialog"]');
    root.style.pointerEvents=root.hidden?'none':'';
  }
  function click(event) {
    const action=event.target.closest('[data-action]')?.dataset.action;
    if (!action)return;
    if (action==='settings') $('[data-settings]').hidden=false;
    else if(action==='close-settings') { $('[data-settings]').hidden=true; modalTick(); }
    else if(action==='reset'){settings={...defaults};applySettings();send('settings',{settings});}
    else if(action.startsWith('test-'))send('cue',{kind:action.slice(5),pilot});
    else if(['playpause','next','previous'].includes(action))send('media',{command:action,sourceId:state.media?.sourceId});
    else if(action==='refresh')send('refresh');
  }
  function change(event) {
    const input=event.target;if(!input.dataset.setting)return;
    applySettings({[input.dataset.setting]:input.type==='checkbox'?input.checked:Number(input.value)});send('settings',{settings});
  }
  shadow.addEventListener('click',click);shadow.addEventListener('change',change);
  const themeObserver=new MutationObserver(theme);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class']});
  // A host dialog opening and closing inside one MutationObserver batch can
  // cancel out and leave the skin hidden; re-check on a microtask as well.
  let modalQueued=false;
  function modalTick(){if(disposed||modalQueued)return;modalQueued=true;queueMicrotask(()=>{modalQueued=false;if(!disposed)hostModal();});}
  const modalObserver=new MutationObserver(modalTick);modalObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','aria-modal']});
  const interval=setInterval(()=>{clock();if(state.quota)renderQuota();},1000);
  window.__codexEva={updateState,setSettings:patch=>applySettings(patch),openSettings:()=>{$('[data-settings]').hidden=false;modalTick();},getSettings:()=>({...settings}),getPilot:()=>pilot,
    dispose(){if(disposed)return;disposed=true;clearInterval(interval);themeObserver.disconnect();modalObserver.disconnect();shadow.removeEventListener('click',click);shadow.removeEventListener('change',change);root.remove();palette.remove();delete document.documentElement.dataset.evaPilot;delete window.__codexEva;}};
  applySettings(settings);theme();clock();hostModal();updateState();
})();
