import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile as callback} from 'node:child_process';
import {promisify} from 'node:util';
const execFile=promisify(callback);

test('companion startup survives the launching terminal job closing', {skip:process.platform!=='win32'},async t=>{
  const root=await mkdtemp(join(tmpdir(),'eva-independent-start-'));
  const pidFile=join(root,'child.pid');
  let pid;
  t.after(async()=>{
    if(pid){
      try{process.kill(pid);}catch{}
      for(let attempt=0;attempt<30;attempt++){
        try{process.kill(pid,0);}catch{break;}
        await new Promise(resolve=>setTimeout(resolve,50));
      }
    }
    await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  });
  await mkdir(join(root,'windows'));
  await mkdir(join(root,'src'));
  const starter=join(root,'windows','start.ps1');
  await copyFile(new URL('../windows/start.ps1',import.meta.url),starter);
  // Only the process payload is a fixture; the actual public starter runs unchanged.
  await writeFile(join(root,'src','main.mjs'),`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000);`);
  await execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./fixtures/job-owner.ps1',import.meta.url))],{
    encoding:'utf8',timeout:25000,
    env:{...process.env,EVA_TEST_STARTER:starter,EVA_TEST_NODE:process.execPath,EVA_TEST_PID:pidFile,EVA_TEST_GATE:join(root,'gate')},
  });
  pid=Number(await readFile(pidFile,'utf8'));
  await new Promise(resolve=>setTimeout(resolve,200));
  assert.ok(pid>0);
  assert.doesNotThrow(()=>process.kill(pid,0),'companion must remain alive after its parent terminal job closes');
});
