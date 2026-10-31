import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const companionRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptPaths = [
  join(companionRoot, 'windows', 'tray.ps1'),
  join(companionRoot, 'windows', 'install.ps1'),
  join(companionRoot, 'windows', 'uninstall.ps1'),
  join(companionRoot, 'windows', 'start.ps1'),
  join(companionRoot, 'windows', 'launch.ps1'),
  join(companionRoot, 'windows', 'shortcut.ps1'),
];

test('file receipts contain only installation-relative paths and content hashes', async (t) => {
  const api = await import('../src/installation.mjs').catch(() => null);
  assert.ok(api, 'src/installation.mjs must export the installation receipt helpers');
  assert.equal(typeof api.createFileReceipt, 'function');

  const root = await mkdtemp(join(tmpdir(), 'eva-install-receipt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ownedPath = join(root, 'src', 'main.mjs');
  await mkdir(dirname(ownedPath), { recursive: true });
  await writeFile(ownedPath, 'owned runtime');

  const receipt = await api.createFileReceipt(root, [ownedPath]);

  assert.deepEqual(receipt, {
    version: 1,
    files: [{
      path: 'src/main.mjs',
      sha256: createHash('sha256').update('owned runtime').digest('hex'),
    }],
  });
});

test('uninstall candidates exclude modified files and paths outside the install root', async (t) => {
  const api = await import('../src/installation.mjs').catch(() => null);
  assert.ok(api, 'src/installation.mjs must export the installation receipt helpers');
  assert.equal(typeof api.createFileReceipt, 'function');
  assert.equal(typeof api.listUnmodifiedReceiptFiles, 'function');

  const base = await mkdtemp(join(tmpdir(), 'eva-install-removal-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'CodexEva');
  const outsidePath = join(base, 'user-data.txt');
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'main.mjs'), 'unchanged runtime');
  await writeFile(join(root, 'user-note.txt'), 'original user note');
  await writeFile(outsidePath, 'outside install root');

  const receipt = await api.createFileReceipt(root, [
    join(root, 'src', 'main.mjs'),
    join(root, 'user-note.txt'),
  ]);
  await writeFile(join(root, 'user-note.txt'), 'user edited this');
  const outsideHash = createHash('sha256').update('outside install root').digest('hex');
  receipt.files.push({ path: '../user-data.txt', sha256: outsideHash });

  assert.deepEqual(await api.listUnmodifiedReceiptFiles(root, receipt), ['src/main.mjs']);
  await assert.rejects(
    api.createFileReceipt(root, [outsidePath]),
    /path|root|invalid|outside/i,
  );
});

test('Windows lifecycle scripts parse without PowerShell AST errors', () => {
  const powershell = process.env.POWERSHELL_EXE || 'powershell.exe';
  const command = [
    '$tokens = $null',
    '$errors = $null',
    '[System.Management.Automation.Language.Parser]::ParseFile($env:EVA_SCRIPT_PATH, [ref]$tokens, [ref]$errors) > $null',
    'if ($errors.Count -gt 0) { $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }',
  ].join('; ');

  for (const scriptPath of scriptPaths) {
    const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], {
      encoding: 'utf8',
      env: { ...process.env, EVA_SCRIPT_PATH: scriptPath },
    });
    assert.equal(
      result.status,
      0,
      `${scriptPath} must parse cleanly with PowerShell AST: ${result.stderr || result.stdout || result.error?.message}`,
    );
  }
});
