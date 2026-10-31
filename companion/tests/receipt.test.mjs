import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {execFile as callback} from 'node:child_process';
const execFile=promisify(callback);

test('receipt replacement and interrupted two-move recovery preserve valid JSON', {skip:process.platform!=='win32'},async t=>{
  const root=await mkdtemp(join(tmpdir(),'eva-receipt-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const path=join(root,'receipt.json');
  const command=`
    . $env:EVA_RECEIPT_HELPER
    Write-EvaReceipt $env:EVA_RECEIPT_PATH @{phase='prepared';original='user value'}
    [IO.File]::Move($env:EVA_RECEIPT_PATH,($env:EVA_RECEIPT_PATH+'.recovery'))
    $restored=Read-EvaReceipt $env:EVA_RECEIPT_PATH
    if($restored.original -ne 'user value'){throw 'RECOVERY_LOST_ORIGINAL'}
    Write-EvaReceipt $env:EVA_RECEIPT_PATH @{phase='committed';original=$restored.original}
  `;
  await execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{env:{...process.env,EVA_RECEIPT_HELPER:fileURLToPath(new URL('../windows/receipt.ps1',import.meta.url)),EVA_RECEIPT_PATH:path}});
  assert.deepEqual(JSON.parse(await readFile(path,'utf8')),{phase:'committed',original:'user value'});
  await assert.rejects(readFile(path+'.recovery'),/ENOENT/);
});
