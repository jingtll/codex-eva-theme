(() => {
  'use strict';
  window.__codexEva?.dispose();
  const defaults = {backgroundStrength:0.18, scale:1, portrait:true, geometry:true, scanlines:true, clock:true, quota:true, music:true, sound:true, approvalSound:true, completedSound:true, volume:0.6};
  let settings = {...defaults, ...window.__EVA_SETTINGS__};
  let state = {quota:null, media:null, status:'已连接', stale:false};
  const assets = window.__EVA_ASSETS__ || {};
  const root = document.createElement('div'); root.id = 'codex-eva-root'; root.dataset.surface='missing';
  const shadow = root.attachShadow({mode:'open'});
  // The source portrait is black alpha linework. Recolour the actual alpha
  // silhouette and expand it slightly; a drop shadow only colours the halo.
  const portraitInk=document.createElementNS('http://www.w3.org/2000/svg','svg');
  portraitInk.setAttribute('width','0');portraitInk.setAttribute('height','0');portraitInk.setAttribute('aria-hidden','true');
  portraitInk.style.position='absolute';
  portraitInk.innerHTML='<defs><filter id="codex-eva-asuka-ink" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="0.75" result="ink"/><feFlood flood-color="#d9364b"/><feComposite in2="ink" operator="in"/></filter></defs>';
  shadow.append(portraitInk);
  const style = document.createElement('style'); style.textContent = window.__EVA_CSS__ || '';
  shadow.append(style);
  // Original DSH unit artwork (600 x 600); keep it separate from the portrait.
  const unitArtwork = {
  "asuka": "<svg viewBox=\"0 0 600 600\" fill=\"none\" stroke=\"currentColor\"><path class=\"eva-art-panel\" d=\"M80 60h235l200 200v235H280L80 295Z\"/><path d=\"M80 60h235l200 200v235H280L80 295Z\" stroke-width=\"2\"/><path d=\"M90 20h250l215 215M45 115v200l225 225h260\" stroke-width=\"12\"/><path class=\"eva-art-fine\" d=\"M102 82h204l187 187v204H289L102 286ZM68 155v149l215 215h155M132 100h150l190 190v154\"/><path class=\"eva-art-detail\" d=\"M354 110l70 70m-36-88 70 70\" stroke-width=\"18\"/><path class=\"eva-art-detail\" d=\"M90 323l24 24m-24-6 24 24m-24-6 24 24\" stroke-width=\"5\"/><text class=\"eva-art-label\" x=\"112\" y=\"126\">EVANGELION / UNIT-02</text><text class=\"eva-art-micro\" x=\"112\" y=\"146\">PRODUCTION MODEL // NERV</text><path class=\"eva-art-fine\" d=\"M112 164h92m10 0h35m39 13v-22h22M130 236v-28h28M435 390v28h-28\"/><circle cx=\"116\" cy=\"186\" r=\"3\"/><circle cx=\"130\" cy=\"186\" r=\"3\"/><circle cx=\"144\" cy=\"186\" r=\"3\"/><text class=\"unit\" x=\"150\" y=\"390\">02</text><path d=\"M140 454h310\" stroke-width=\"2\"/><path class=\"eva-art-fine\" d=\"M140 444h310M140 461v12m10-12v7m10-7v7m10-7v12m10-12v7m10-7v7m10-7v12M350 461h100\"/><text class=\"eva-art-label\" x=\"278\" y=\"492\">SECOND CHILD</text><text class=\"eva-art-micro\" x=\"294\" y=\"508\">ASUKA LANGLEY // 02</text><path class=\"eva-art-detail\" d=\"M459 420h12v12h-12zM480 441h12v12h-12z\" fill=\"currentColor\" stroke=\"none\"/></svg>",
  "rei": "<svg viewBox=\"0 0 600 600\" fill=\"none\" stroke=\"currentColor\"><circle cx=\"300\" cy=\"300\" r=\"242\" stroke-width=\"1\"/><circle cx=\"300\" cy=\"300\" r=\"255\" stroke-width=\"5\" stroke-dasharray=\"1 25.7\"/><circle cx=\"300\" cy=\"300\" r=\"230\" stroke-dasharray=\"90 18 2 18\"/><circle cx=\"300\" cy=\"300\" r=\"215\" stroke-width=\"3\" stroke-dasharray=\"200 22 2 22\"/><circle class=\"eva-art-fine\" cx=\"300\" cy=\"300\" r=\"198\" stroke-dasharray=\"2 7\"/><path d=\"M300 26v68m0 412v68M26 300h68m412 0h68\" stroke-width=\"2\"/><path d=\"M300 112l188 188-188 188-188-188Z\"/><path class=\"eva-art-fine\" d=\"M300 128l172 172-172 172-172-172ZM146 146h28v-18m280 18h-28v-18M146 454h28v18m280-18h-28v18\"/><g class=\"eva-art-detail\"><circle cx=\"300\" cy=\"72\" r=\"9\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"300\" cy=\"72\" r=\"15\"/><circle cx=\"300\" cy=\"528\" r=\"5\" fill=\"currentColor\"/><path d=\"M63 294h12v12H63zM525 294h12v12h-12z\" stroke-width=\"2\"/></g><text class=\"eva-art-label\" x=\"175\" y=\"180\">EVANGELION / UNIT-00</text><text class=\"eva-art-micro\" x=\"190\" y=\"196\">PROTOTYPE // NERV</text><text class=\"unit\" x=\"156\" y=\"368\">00</text><path class=\"eva-art-fine\" d=\"M196 398h208m-208 8h52m104 0h52\"/><text class=\"eva-art-label\" x=\"218\" y=\"430\">FIRST CHILD</text><text class=\"eva-art-micro\" x=\"199\" y=\"446\">REI AYANAMI // 00</text></svg>"
};
  const shell = document.createElement('div'); shell.className='shell';
  shell.innerHTML = `<div class="scanlines" aria-hidden="true"></div><div class="geometry" aria-hidden="true"></div><img class="portrait" alt="" aria-hidden="true"><div class="rail"><header class="pilot"><img class="logo" alt="NERV"><div><small>PERSONAL CONTROL SYSTEM</small><strong data-name></strong><span data-status></span></div><button data-action="settings" title="显示设置" aria-label="显示设置">⚙</button></header><section class="card clock"><div class="caption">時刻管制 <span>LOCAL TIME</span></div><time data-clock></time><div class="clock-meta" data-date></div></section><section class="card quota"><div class="caption">残存稼働限界 <span>ACCOUNT QUOTA</span></div><div data-quota></div><div class="quota-footer"><span data-updated></span><button data-action="refresh" aria-label="刷新额度">↻</button></div><details><summary>额度详情</summary><div data-quota-detail></div></details></section><section class="card music" hidden><div class="caption">音声管制 <span>NOW PLAYING</span></div><strong data-track></strong><div class="muted" data-artist></div><div class="controls"><button data-action="previous" aria-label="上一首">◀</button><button data-action="playpause" aria-label="播放或暂停">Ⅱ / ▶</button><button data-action="next" aria-label="下一首">▶</button></div></section></div><section class="settings card" data-settings hidden aria-label="显示设置"><div class="caption">表示設定 <button data-action="close-settings" aria-label="关闭显示设置">×</button></div><div data-fields></div><div class="controls"><button data-action="test-approval">试听审核</button><button data-action="test-completed">试听完成</button></div><button data-action="reset">恢复全部默认</button></section>`;
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
    $('.geometry').innerHTML=unitArtwork[pilot];
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
  let layoutFrame=0,layoutTargets=[];
  const layoutResize=new ResizeObserver(queueLayout);
  function queueLayout(){if(!disposed&&!layoutFrame)layoutFrame=requestAnimationFrame(()=>{layoutFrame=0;layout();});}
  function layout(){
    if(disposed)return;
    const visible=element=>{const b=element.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(element).visibility!=='hidden';};
    const input=[...document.querySelectorAll('[contenteditable="true"],textarea[placeholder]')].find(visible);
    const surface=input?.closest('main,[role="main"]')||[...document.querySelectorAll('main,[role="main"]')].filter(visible).sort((a,b)=>a.getBoundingClientRect().width*a.getBoundingClientRect().height-b.getBoundingClientRect().width*b.getBoundingClientRect().height)[0];
    root.dataset.surface=surface||input?'ready':'missing';
    if(!surface&&!input)return;
    const composer=input?.closest('form,[data-composer-body],.composer')||input;
    const bounds=(surface||document.documentElement).getBoundingClientRect();
    const top=Math.max(0,bounds.top),left=Math.max(0,bounds.left),right=Math.min(innerWidth,bounds.right);
    const bottom=Math.max(top,Math.min(innerHeight,bounds.bottom,composer?composer.getBoundingClientRect().top-12:innerHeight));
    // Neutralize an inherited host CSS zoom: the measured bounds are already
    // viewport coordinates. Native page zoom instead changes innerWidth itself.
    const zoom=String(1/(Number(getComputedStyle(document.body).zoom)||1));
    if(root.style.zoom!==zoom)root.style.zoom=zoom;
    const inset=`${top}px ${Math.max(0,innerWidth-right)}px ${Math.max(0,innerHeight-bottom)}px ${left}px`;
    if(root.style.inset!==inset)root.style.inset=inset;
    const targets=[surface,composer].filter(Boolean);
    if(targets.length!==layoutTargets.length||targets.some((target,index)=>target!==layoutTargets[index])){
      layoutResize.disconnect();layoutTargets=targets;targets.forEach(target=>layoutResize.observe(target));
    }
  }
  const layoutMutations=new MutationObserver(queueLayout);
  layoutMutations.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class','style']});
  window.addEventListener('resize',queueLayout);
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
    dispose(){if(disposed)return;disposed=true;clearInterval(interval);cancelAnimationFrame(layoutFrame);layoutResize.disconnect();layoutMutations.disconnect();window.removeEventListener('resize',queueLayout);themeObserver.disconnect();modalObserver.disconnect();shadow.removeEventListener('click',click);shadow.removeEventListener('change',change);root.remove();palette.remove();delete document.documentElement.dataset.evaPilot;delete window.__codexEva;}};
  applySettings(settings);theme();clock();hostModal();updateState();layout();
})();
