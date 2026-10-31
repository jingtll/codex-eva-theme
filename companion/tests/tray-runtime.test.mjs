import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('real tray drains status messages without blocking and exits when its owner closes stdin', {skip: process.platform !== 'win32'}, async t => {
  const child = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-STA','-File',fileURLToPath(new URL('../windows/tray.ps1',import.meta.url))], {windowsHide:true,stdio:['pipe','pipe','pipe']});
  t.after(()=>child.kill());
  let stderr=''; child.stderr.on('data',chunk=>{stderr+=chunk});
  child.stdin.on('error',()=>{});
  const exit = new Promise(resolve=>{child.once('exit',(code)=>resolve(code));child.once('error',()=>resolve(-1));});
  child.stdin.end(JSON.stringify({type:'status',text:'等待 Codex '.repeat(20)})+'\n');
  let timeout;
  const result=await Promise.race([exit,new Promise(resolve=>{timeout=setTimeout(()=>resolve('timeout'),6000)})]);
  clearTimeout(timeout);
  assert.equal(result,0,stderr || 'tray did not exit after stdin EOF');
});
