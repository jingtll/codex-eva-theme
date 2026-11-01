import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile as callback} from 'node:child_process';
import {promisify} from 'node:util';
const execFile=promisify(callback);

test('click startup and installation share Node lookup even outside PATH', {skip:process.platform!=='win32'},async t=>{
  const root=await mkdtemp(join(tmpdir(),'eva-node-lookup-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'nodejs'));
  const node=join(root,'nodejs','node.exe');
  await writeFile(node,'lookup fixture, never executed');
  const command=`. $env:EVA_CONTEXT_SCRIPT; function Get-Command { }; $env:ProgramFiles=$env:EVA_NODE_HOME; \${env:ProgramFiles(x86)}=$env:EVA_NODE_HOME; $env:LOCALAPPDATA=$env:EVA_NODE_HOME; Find-EvaNode`;
  const {stdout}=await execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{
    encoding:'utf8',env:{...process.env,EVA_CONTEXT_SCRIPT:fileURLToPath(new URL('../windows/desktop-context.ps1',import.meta.url)),EVA_NODE_HOME:root},
  });
  assert.equal(stdout.trim(),node);
});
