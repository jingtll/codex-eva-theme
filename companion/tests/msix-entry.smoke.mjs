import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile as callback} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findCodexTarget} from '../src/discovery.mjs';
import {connectCdp} from '../src/cdp.mjs';
const execFile=promisify(callback);

// Identity smoke for the official alias used by the click launcher. Companion
// startup is tested separately; this disposable link never starts a real companion.
test('the official alias used by the launcher preserves package identity, app ID and loopback debugging', {skip:process.platform!=='win32'},async t=>{
  const root=await mkdtemp(join(tmpdir(),'eva-msix-entry-'));
  const profile=join(root,'user-data');
  await mkdir(profile);await mkdir(join(root,'home'));
  const env={...process.env,APPDATA:join(root,'appdata'),CODEX_HOME:join(root,'home'),CODEX_ELECTRON_USER_DATA_PATH:profile,EVA_TEST_PROFILE:profile,EVA_TEST_LINK:join(root,'Codex EVA.lnk')};
  const run=command=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{env,windowsHide:true,timeout:15000});
  let cdp;
  t.after(async()=>{
    if(cdp){await cdp.send('Browser.close').catch(()=>{});cdp.close();}
    // A packaged client can remain in the background after its window closes.
    // Stop only processes carrying this test's unique user-data path.
    await run(`Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object {$_.CommandLine.Contains($env:EVA_TEST_PROFILE) -and $_.CommandLine -notmatch '--type='} | ForEach-Object {Stop-Process -Id $_.ProcessId -ErrorAction Stop;Wait-Process -Id $_.ProcessId -Timeout 5 -ErrorAction SilentlyContinue}`);
    // The app can briefly hold its user-data files while exiting.
    await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200});
  });
  const occupied=await run(`if(Get-NetTCPConnection -State Listen -LocalPort 19331 -ErrorAction SilentlyContinue){'OCCUPIED'}`);
  assert.ok(!occupied.stdout.includes('OCCUPIED'),'smoke port must be free');
  await execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('../windows/shortcut.ps1',import.meta.url)),'-ShortcutDirectory',root],{env,windowsHide:true});
  // Use the validated alias recorded by production generation, with disposable
  // port/profile arguments, to avoid starting a production companion in a smoke test.
  await run(`$receipt=Get-Content (Join-Path $env:APPDATA 'CodexEva\\shortcut-receipt.json') -Raw | ConvertFrom-Json;$link=(New-Object -ComObject WScript.Shell).CreateShortcut($env:EVA_TEST_LINK);$link.TargetPath=$receipt.aliasPath;$link.Arguments='--remote-debugging-port=19331 --remote-debugging-address=127.0.0.1 --user-data-dir="'+$env:EVA_TEST_PROFILE+'"';$link.Save();Start-Process -FilePath $env:EVA_TEST_LINK -WindowStyle Hidden`);
  let target;
  for(let attempt=0;attempt<80;attempt++){
    const candidate=await findCodexTarget({port:19331,timeoutMs:200});
    if(candidate.status==='found'){target=candidate;break;}
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  assert.ok(target,'actual shortcut passes debugging switches');
  const owner=await run(`$listeners=@(Get-NetTCPConnection -State Listen -LocalPort 19331);$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listeners[0].OwningProcess);@{pid=$p.ProcessId;isolated=$p.CommandLine.Contains($env:EVA_TEST_PROFILE);addresses=@($listeners | Select-Object -ExpandProperty LocalAddress)}|ConvertTo-Json -Compress`);
  const processInfo=JSON.parse(owner.stdout);
  assert.equal(processInfo.isolated,true,'never close an unconfirmed real client');
  assert.ok(processInfo.addresses.length>0&&processInfo.addresses.every(address=>['127.0.0.1','::1'].includes(address)));
  cdp=await connectCdp(target.webSocketDebuggerUrl);
  const probe=await execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./fixtures/process-identity.ps1',import.meta.url)),'-ProcessId',String(processInfo.pid)],{env,windowsHide:true});
  const identity=JSON.parse(probe.stdout);
  assert.equal(identity.packageCode,0,'official package identity must be present');
  assert.equal(identity.appCode,0,'official app ID must be present');
  assert.match(identity.package,/^OpenAI\.Codex_/);
  assert.match(identity.appId,/^OpenAI\.Codex_[^!]+!App$/);
});
