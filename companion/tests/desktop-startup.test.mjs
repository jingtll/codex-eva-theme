import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile as callback} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const execFile=promisify(callback);

test('desktop status acknowledges the real native context without changing startup', {skip:process.platform!=='win32'},async()=>{
  const script=fileURLToPath(new URL('../windows/desktop.ps1',import.meta.url));
  const run=()=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',script,'-Action','Status'],{encoding:'utf8',timeout:40000});
  const first=JSON.parse((await run()).stdout),second=JSON.parse((await run()).stdout);
  assert.equal(first.ok,true);assert.equal(first.action,'Status');
  assert.equal(first.state.packageCode,15700,'status must come from an unpackaged desktop worker');
  assert.equal(first.state.startupCommand,second.state.startupCommand,'read-only status never changes the real startup value');
});

test('desktop worker rejects a response path outside its own request directory', {skip:process.platform!=='win32'},async()=>{
  const script=fileURLToPath(new URL('../windows/desktop.ps1',import.meta.url));
  await assert.rejects(execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',script,'-Worker','-Action','Status','-ResponsePath','C:\\unexpected-response.json'],{encoding:'utf8'}),/INVALID_RESPONSE_PATH/);
});
