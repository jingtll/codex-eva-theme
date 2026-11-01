import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile as callback} from 'node:child_process';
import {promisify} from 'node:util';
const execFile=promisify(callback);
const script=fileURLToPath(new URL('../windows/shortcut.ps1',import.meta.url));

test('desktop shortcut is repeatable and removal preserves a user-modified shortcut', {skip:process.platform!=='win32'},async t=>{
  const root=await mkdtemp(join(tmpdir(),'eva-shortcut-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const desktop=join(root,'Desktop'),appdata=join(root,'AppData');
  await mkdir(desktop);
  const run=extra=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-ShortcutDirectory',desktop,...extra],{env:{...process.env,APPDATA:appdata},encoding:'utf8'});
  await run([]);
  const link=join(desktop,'Codex EVA.lnk');
  const inspected=await execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',`
    $link=(New-Object -ComObject WScript.Shell).CreateShortcut($env:EVA_TEST_LINK)
    $package=Get-AppxPackage -Name OpenAI.Codex
    @{target=$link.TargetPath;expected=(Join-Path $env:EVA_TEST_ROOT 'build\\CodexEvaLauncher.exe');arguments=$link.Arguments;style=$link.WindowStyle} | ConvertTo-Json -Compress
  `],{encoding:'utf8',env:{...process.env,EVA_TEST_LINK:link,EVA_TEST_ROOT:fileURLToPath(new URL('../',import.meta.url))}});
  const properties=JSON.parse(inspected.stdout);
  assert.equal(properties.target,properties.expected);
  assert.equal(properties.arguments,'');
  assert.equal(properties.style,1);
  const first=await readFile(link);
  await run([]);
  assert.deepEqual(await readFile(link),first);
  await writeFile(link,'user changed this shortcut');
  await assert.rejects(run([]),/SHORTCUT_CONFLICT/);
  await run(['-Remove']);
  assert.equal(await readFile(link,'utf8'),'user changed this shortcut');
  await rm(link);
  await run([]);
  await run(['-Remove']);
  await assert.rejects(readFile(link),/ENOENT/);
  await run([]);
  await execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Remove'],{env:{...process.env,APPDATA:appdata}});
  await assert.rejects(readFile(link),/ENOENT/);
});

test('a stale owned shortcut requires explicit removal and a failed lookup creates nothing', {skip:process.platform!=='win32'},async t=>{
  const root=await mkdtemp(join(tmpdir(),'eva-shortcut-stale-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const desktop=join(root,'Desktop'),appdata=join(root,'AppData');
  const run=extra=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',script,'-ShortcutDirectory',desktop,...extra],{env:{...process.env,APPDATA:appdata},encoding:'utf8'});
  await run([]);
  const link=join(desktop,'Codex EVA.lnk'),receiptPath=join(appdata,'CodexEva','shortcut-receipt.json');
  const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
  receipt.aliasPath='C:\\Old Alias\\chatgpt-desktop.exe';
  await writeFile(receiptPath,JSON.stringify(receipt));
  const before=await readFile(link);
  await assert.rejects(run([]),/SHORTCUT_REFRESH_REQUIRED/);
  assert.deepEqual(await readFile(link),before);
  for(const version of [1,2,3]){
    receipt.version=version;
    receipt.phase='prepared';
    await writeFile(receiptPath,JSON.stringify(receipt));
    await assert.rejects(run([]),/SHORTCUT_REFRESH_REQUIRED/);
    assert.deepEqual(await readFile(link),before);
  }
  await run(['-Remove']);
  const command=`function Get-AppxPackage { @() }; & $env:EVA_TEST_SCRIPT -ShortcutDirectory $env:EVA_TEST_DESKTOP`;
  await assert.rejects(execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{env:{...process.env,APPDATA:appdata,EVA_TEST_SCRIPT:script,EVA_TEST_DESKTOP:desktop}}),/CODEX_INSTALL_NOT_UNIQUE/);
  await assert.rejects(readFile(link),/ENOENT/);
  await assert.rejects(readFile(receiptPath),/ENOENT/);
  const noAlias=`function Get-AppxPackageManifest { [xml]'<Package><Applications><Application Id="App" Executable="app/ChatGPT.exe"/></Applications></Package>' }; & $env:EVA_TEST_SCRIPT -ShortcutDirectory $env:EVA_TEST_DESKTOP`;
  await assert.rejects(execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',noAlias],{env:{...process.env,APPDATA:appdata,EVA_TEST_SCRIPT:script,EVA_TEST_DESKTOP:desktop}}),/CODEX_ALIAS_UNAVAILABLE/);
  await assert.rejects(readFile(link),/ENOENT/);
  await assert.rejects(readFile(receiptPath),/ENOENT/);
});

test('launcher resolves the installed package each time, uses loopback, and refuses to restart normal sessions', {skip:process.platform!=='win32'},async t=>{
  const root=await mkdtemp(join(tmpdir(),'eva-launch-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'app'));
  await writeFile(join(root,'app','ChatGPT.exe'),'fixture, never executed');
  const launcher=fileURLToPath(new URL('../windows/launch.ps1',import.meta.url));
  const command=`
    . $env:EVA_TEST_LAUNCH
    function Start-EvaCompanion { [Console]::WriteLine('SPAWN:{"style":"Independent"}') }
    function Wait-EvaTheme { [Console]::WriteLine('THEME-CHECKED') }
    function Get-AppxPackage { [pscustomobject]@{InstallLocation=$env:EVA_TEST_PACKAGE} }
    function Get-AppxPackageManifest { [xml]'<Package><Applications><Application Id="App" Executable="app/ChatGPT.exe"><Extensions><Extension><AppExecutionAlias><ExecutionAlias Alias="chatgpt-desktop.exe"/></AppExecutionAlias></Extension></Extensions></Application></Applications></Package>' }
    function Get-CimInstance { if($env:EVA_TEST_RUNNING -eq '1'){[pscustomobject]@{ExecutablePath=(Join-Path $env:EVA_TEST_PACKAGE 'app\\ChatGPT.exe');CommandLine='ChatGPT.exe'}} }
    function New-Object {
      param($ComObject)
      if($ComObject -ne 'Shell.Application'){throw 'UNEXPECTED_COM_OBJECT'}
      $app=[pscustomobject]@{}
      $app | Add-Member ScriptMethod ShellExecute {param($file,$arguments,$cwd,$verb,$style) [Console]::WriteLine(('SPAWN:'+(@{file=$file;arguments=@($arguments);style='Independent'}|ConvertTo-Json -Compress)))}
      $windows=[pscustomobject]@{Desktop=[pscustomobject]@{Document=[pscustomobject]@{Application=$app}}}
      $windows | Add-Member ScriptMethod FindWindowSW {param($a,$b,$c,$d,$e) return $this.Desktop}
      $shell=[pscustomobject]@{WindowList=$windows}
      $shell | Add-Member ScriptMethod Windows {return $this.WindowList}
      return $shell
    }
    function Start-Process { param($FilePath,$ArgumentList,$WindowStyle) [Console]::WriteLine(('SPAWN:'+(@{file=$FilePath;arguments=@($ArgumentList);style=$WindowStyle}|ConvertTo-Json -Compress))) }
    try { Start-EvaCodex } catch { [Console]::WriteLine($_.Exception.Message); exit 3 }
  `;
  const run=running=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',env:{...process.env,EVA_TEST_LAUNCH:launcher,EVA_TEST_PACKAGE:root,EVA_TEST_RUNNING:running}});
  const result=await run('0');
  const calls=result.stdout.trim().split(/\r?\n/).filter(line=>line.startsWith('SPAWN:')).map(line=>JSON.parse(line.slice(6)));
  assert.equal(calls.length,2);
  assert.equal(calls[0].style,'Independent');
  assert.equal(calls[1].file,join(process.env.LOCALAPPDATA,'Microsoft','WindowsApps','chatgpt-desktop.exe'));
  assert.deepEqual(calls[1].arguments,['--remote-debugging-port=19327','--remote-debugging-address=127.0.0.1']);
  await assert.rejects(run('1'),error=>error.stdout.includes('CODEX_RESTART_REQUIRED')&&!error.stdout.includes('SPAWN:'));
});

test('an interrupted prepared shortcut is resumed without leaving the staged link behind', {skip:process.platform!=='win32'},async t=>{
  const root=await mkdtemp(join(tmpdir(),'eva-shortcut-resume-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const desktop=join(root,'Desktop'),appdata=join(root,'AppData');
  const run=()=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-ShortcutDirectory',desktop],{env:{...process.env,APPDATA:appdata},encoding:'utf8'});
  await run();
  const data=join(appdata,'CodexEva'),receiptPath=join(data,'shortcut-receipt.json'),link=join(desktop,'Codex EVA.lnk');
  const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
  receipt.phase='prepared';receipt.temporaryName='shortcut-build-0123456789abcdef0123456789abcdef.lnk';
  const staged=join(data,receipt.temporaryName);
  await rename(link,staged);
  await writeFile(receiptPath,JSON.stringify(receipt));
  await run();
  assert.ok((await readFile(link)).length>0);
  await assert.rejects(readFile(staged),/ENOENT/);
  assert.equal(JSON.parse(await readFile(receiptPath,'utf8')).phase,'committed');
});
