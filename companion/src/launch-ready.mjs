import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {isCodexTarget} from './discovery.mjs';
import {connectCdp} from './cdp.mjs';

// Read only derived UI state; no chat text or account data leaves the renderer.
export async function inspectThemeTargets(targets, connect = connectCdp) {
  const pages=[];
  for (const target of targets.filter(target=>isCodexTarget(target,'app://-'))) {
    let cdp;
    try {
      cdp=await connect(target.webSocketDebuggerUrl,{timeoutMs:1000});
      const result=await cdp.send('Runtime.evaluate',{
        expression:'({visible:document.visibilityState==="visible",composer:!!document.querySelector(\'[contenteditable="true"],textarea[placeholder]\'),skin:!!window.__codexEva})',
        returnByValue:true,
      });
      if (result.result?.value) pages.push(result.result.value);
    } catch { /* A renderer may be replaced during startup; retry on the next poll. */ }
    finally { cdp?.close(); }
  }
  const workbenches=pages.filter(page=>page.composer);
  const visible=workbenches.filter(page=>page.visible);
  if (visible.length?visible.every(page=>page.skin):workbenches.some(page=>page.skin)) return 'ready';
  return workbenches.length?'theme_unavailable':pages.length?'waiting_for_workbench':'endpoint_unavailable';
}

export async function waitForTheme(port,{timeoutMs=30000}={}) {
  if (!Number.isInteger(port)||port<1024||port>65535) throw new Error('INVALID_DEBUG_PORT');
  const deadline=Date.now()+timeoutMs;
  let status='endpoint_unavailable';
  do {
    try {
      const response=await fetch(`http://127.0.0.1:${port}/json/list`,{redirect:'error',signal:AbortSignal.timeout(1000)});
      if (!response.ok) throw new Error('ENDPOINT_UNAVAILABLE');
      const targets=await response.json();
      if (!Array.isArray(targets)) throw new Error('INVALID_TARGETS');
      status=await inspectThemeTargets(targets);
      if (status==='ready') return {status};
    } catch { status='endpoint_unavailable'; }
    await new Promise(resolve=>setTimeout(resolve,250));
  } while (Date.now()<deadline);
  return {status};
}

if (process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await waitForTheme(Number(process.argv[2]))));
}
