import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const companionRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const installScript = join(companionRoot, 'windows', 'install.ps1');
const uninstallScript = join(companionRoot, 'windows', 'uninstall.ps1');
const runName = 'CodexEvaCompanion';

function encoded(command) {
  return Buffer.from(command, 'utf16le').toString('base64');
}

async function runPowerShell(command) {
  return await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded(command)], { encoding: 'utf8' });
}

// Scratch key: the installer honours this override so tests never write the
// real startup entry.
const RUN_KEY = String.raw`HKCU:\Software\CodexEvaTest`;

async function readReceipt(home) {
  const text = await readFile(join(home, 'AppData', 'Roaming', 'CodexEva', 'install-receipt.json'), 'utf8');
  assert.equal(text.charCodeAt(0), '{'.charCodeAt(0), 'receipt must be BOM-free JSON');
  return JSON.parse(text);
}

async function runInstall(home, script = installScript) {
  return await execFile('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
  ], {
    encoding: 'utf8',
    env: { ...process.env, APPDATA: join(home, 'AppData', 'Roaming'), CODEX_EVA_RUN_KEY: RUN_KEY },
  });
}

async function registryValue() {
  const { stdout } = await runPowerShell(`(Get-ItemProperty -Path '${RUN_KEY}' -Name '${runName}' -ErrorAction SilentlyContinue).${runName}`);
  return stdout.trim() || null;
}

async function setRegistryValue(value) {
  if (value) {
    const escaped = value.replace(/'/g, "''");
    await runPowerShell(`New-Item -Path '${RUN_KEY}' -Force | Out-Null; Set-ItemProperty -Path '${RUN_KEY}' -Name '${runName}' -Value '${escaped}'`);
  } else {
    await runPowerShell(`Remove-ItemProperty -Path '${RUN_KEY}' -Name '${runName}' -ErrorAction SilentlyContinue; exit 0`);
  }
}

// Some shells block registry writes outright (unauthorized-persistence guard)
// while still allowing reads. Probe with a non-destructive write round trip to a
// scratch value and skip the registry scenarios when it is refused.
let registryWritable = null;
async function hasRegistryWrite() {
  if (registryWritable !== null) return registryWritable;
  const probe = String.raw`HKCU:\Software\CodexEvaTestProbe`;
  try {
    const { stdout } = await runPowerShell(
      `New-Item -Path '${probe}' -Force | Out-Null; Set-ItemProperty -Path '${probe}' -Name 'probe' -Value 'x' -ErrorAction Stop; ` +
      `$value = (Get-ItemProperty -Path '${probe}' -Name 'probe').probe; ` +
      `Remove-Item -Path '${probe}' -Recurse -Force -ErrorAction SilentlyContinue; ` +
      `if ($value -eq 'x') { 'WRITABLE' } else { 'BLOCKED' }`,
    );
    registryWritable = stdout.includes('WRITABLE');
  } catch {
    registryWritable = false;
  }
  return registryWritable;
}

const userEntry = '"C:\\Users\\someone\\node.exe" "D:\\elsewhere\\main.mjs"';

test('install records a receipt, a rerun is idempotent, and uninstall removes only its own entry', async (t) => {
  if (!(await hasRegistryWrite())) { t.skip('registry writes are blocked in this shell'); return; }
  const original = await registryValue();
  const home = await mkdtemp(join(tmpdir(), 'eva-install-home-'));
  t.after(async () => {
    await setRegistryValue(original);
    await runPowerShell(`Remove-Item -Path '${RUN_KEY}' -Recurse -Force -ErrorAction SilentlyContinue`);
    await rm(home, { recursive: true, force: true });
  });

  const first = await runInstall(home);
  assert.match(first.stdout, /REG-OK: command = /);
  const receipt = await readReceipt(home);
  assert.equal(receipt.registry.name, runName);
  assert.match(receipt.registry.command, /-WindowStyle Hidden/);
  assert.match(receipt.registry.command, /start\.ps1/);
  assert.equal(await registryValue(), receipt.registry.command);

  const second = await runInstall(home);
  assert.match(second.stdout, /REG-OK: already up to date/);

  // A value changed by the user must survive uninstall.
  await setRegistryValue(userEntry);
  const uninstall = await runInstall(home, uninstallScript);
  assert.match(uninstall.stdout, /REG-OK: user value kept/);
  assert.equal(await registryValue(), userEntry);
  await assert.rejects(readFile(join(home, 'AppData', 'Roaming', 'CodexEva', 'install-receipt.json'), 'utf8'), /ENOENT/);
});

test('uninstall without a receipt touches nothing', async (t) => {
  if (!(await hasRegistryWrite())) { t.skip('registry writes are blocked in this shell'); return; }
  const original = await registryValue();
  const home = await mkdtemp(join(tmpdir(), 'eva-install-empty-'));
  t.after(async () => {
    await setRegistryValue(original);
    await runPowerShell(`Remove-Item -Path '${RUN_KEY}' -Recurse -Force -ErrorAction SilentlyContinue`);
    await rm(home, { recursive: true, force: true });
  });
  await setRegistryValue(userEntry);
  const result = await runInstall(home, uninstallScript);
  const observed = await registryValue();
  assert.match(result.stdout, /REG-OK: no receipt/);
  assert.equal(observed, userEntry);
});

test('reinstall preserves a user change and uninstall restores the pre-install startup entry', async t => {
  if (!(await hasRegistryWrite())) {t.skip('registry writes are blocked in this shell');return;}
  const original=await registryValue();
  const home=await mkdtemp(join(tmpdir(),'eva-install-restore-'));
  t.after(async()=>{await setRegistryValue(original);await rm(home,{recursive:true,force:true});});
  await setRegistryValue(userEntry);
  await runInstall(home);
  const receipt=await readReceipt(home);
  assert.equal(receipt.registry.previousValue,userEntry);
  await setRegistryValue('user modified after install');
  await assert.rejects(runInstall(home),/REGISTRY_CONFLICT/);
  assert.equal(await registryValue(),'user modified after install');
  await setRegistryValue(receipt.registry.command);
  await runInstall(home,uninstallScript);
  assert.equal(await registryValue(),userEntry);
});

test('the migrated assets still match the hashes recorded in NOTICE', async () => {
  const notice = await readFile(join(companionRoot, 'NOTICE.md'), 'utf8');
  const rows = [...notice.matchAll(/\| `(assets\/[^`]+)` \|[^|]*\| `([a-f0-9]{64})` \|/g)];
  assert.equal(rows.length, 7);
  for (const [, relativePath, expected] of rows) {
    const bytes = await readFile(join(companionRoot, relativePath));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, basename(relativePath));
  }
});

test('uninstaller stops a running paused companion before removing its settings', async t => {
  if (!(await hasRegistryWrite())) {t.skip('registry writes are blocked in this shell');return;}
  const {startCompanion}=await import('../src/main.mjs');
  const original=await registryValue();
  const home=await mkdtemp(join(tmpdir(),'eva-uninstall-live-'));
  t.after(async()=>{await setRegistryValue(original);await rm(home,{recursive:true,force:true});});
  await runInstall(home);
  const file=join(home,'AppData','Roaming','CodexEva','settings.json');
  const runtime=await startCompanion({settingsPath:file,findTarget:async()=>null,sendTray:()=>{},stopSounds:async()=>{}});
  t.after(()=>runtime.stop());
  await runtime.updateSettings({volume:0.25});
  await runtime.pause();
  await runInstall(home,uninstallScript);
  assert.equal(runtime.state,'stopped');
  await runtime.stop();
  await assert.rejects(readFile(file),/ENOENT/);
  await assert.rejects(readFile(`${file}.lock`),/ENOENT/);
});
