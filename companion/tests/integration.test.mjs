import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { applyPatch, restorePatch } from '../src/integration.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'eva-integration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const targetPath = join(root, 'config.json');
  const backupDir = join(root, 'backups');
  const original = Buffer.from('{"theme":"default"}\n');
  await writeFile(targetPath, original);
  return { root, targetPath, backupDir, original };
}

test('writes a durable patch receipt and restores the exact original bytes', async (t) => {
  const { targetPath, backupDir, original } = await fixture(t);
  const patched = Buffer.from('{"theme":"eva"}\n');

  const receipt = await applyPatch({
    path: targetPath,
    expectedHash: sha256(original),
    content: patched,
    backupDir,
  });

  assert.equal(await readFile(targetPath, 'utf8'), patched.toString());
  assert.equal(receipt.originalHash, sha256(original));
  assert.equal(receipt.patchedHash, sha256(patched));
  assert.equal(await readFile(receipt.backupPath, 'hex'), original.toString('hex'));
  assert.deepEqual(JSON.parse(await readFile(receipt.receiptPath, 'utf8')), receipt);
  assert.notEqual(dirname(receipt.backupPath), dirname(targetPath));

  const restored = await restorePatch(JSON.parse(JSON.stringify(receipt)));
  assert.deepEqual(await readFile(targetPath), original);
  assert.equal(restored.restoredHash, sha256(original));
});

test('rejects a source whose current hash differs from expectedHash without writing a backup', async (t) => {
  const { targetPath, backupDir, original } = await fixture(t);
  await assert.rejects(applyPatch({
    path: targetPath,
    expectedHash: '0'.repeat(64),
    content: 'replacement',
    backupDir,
  }), { code: 'PATCH_EXPECTED_HASH_MISMATCH' });

  assert.deepEqual(await readFile(targetPath), original);
  await assert.rejects(lstat(backupDir), { code: 'ENOENT' });
});

test('rejects a forged receipt before using its paths', async (t) => {
  const { root, targetPath, backupDir, original } = await fixture(t);
  const receipt = await applyPatch({
    path: targetPath,
    expectedHash: sha256(original),
    content: 'patched',
    backupDir,
  });
  const outsidePath = join(root, 'outside.txt');
  await writeFile(outsidePath, 'leave me alone');

  await assert.rejects(restorePatch({ ...receipt, id: '../outside.txt' }), { code: 'PATCH_RECEIPT_INVALID' });
  await assert.rejects(restorePatch({ ...receipt, path: outsidePath }), { code: 'PATCH_RECEIPT_INVALID' });
  assert.equal(await readFile(outsidePath, 'utf8'), 'leave me alone');
  assert.equal(await readFile(targetPath, 'utf8'), 'patched');
});

test('does not restore over a file changed after the patch was applied', async (t) => {
  const { targetPath, backupDir, original } = await fixture(t);
  const receipt = await applyPatch({
    path: targetPath,
    expectedHash: sha256(original),
    content: 'patched',
    backupDir,
  });
  await writeFile(targetPath, 'user update');

  await assert.rejects(restorePatch(receipt), { code: 'PATCH_RESTORE_CONFLICT' });
  assert.equal(await readFile(targetPath, 'utf8'), 'user update');
});

test('a repeated install with a stale expectedHash does not replace the first patch', async (t) => {
  const { targetPath, backupDir, original } = await fixture(t);
  const receipt = await applyPatch({
    path: targetPath,
    expectedHash: sha256(original),
    content: 'first patch',
    backupDir,
  });

  await assert.rejects(applyPatch({
    path: targetPath,
    expectedHash: sha256(original),
    content: 'second patch',
    backupDir,
  }), { code: 'PATCH_EXPECTED_HASH_MISMATCH' });

  assert.equal(await readFile(targetPath, 'utf8'), 'first patch');
  assert.equal((await readdir(backupDir)).length, 1);
  assert.equal(receipt.patchedHash, sha256('first patch'));
});

test('rejects a symlink target', async (t) => {
  const { root, backupDir, original } = await fixture(t);
  const actualPath = join(root, 'actual.json');
  const targetLink = join(root, 'target-link.json');
  await writeFile(actualPath, original);
  try {
    await symlink(actualPath, targetLink, 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`file symlinks unavailable: ${error.code}`);
      return;
    }
    throw error;
  }

  await assert.rejects(applyPatch({
    path: targetLink,
    expectedHash: sha256(original),
    content: 'replacement',
    backupDir,
  }), { code: 'PATCH_PATH_SYMLINK' });
  assert.deepEqual(await readFile(actualPath), original);
});

test('rejects a target below a symlinked parent', async (t) => {
  const { root, backupDir, original } = await fixture(t);
  const realParent = join(root, 'real-parent');
  const linkedParent = join(root, 'linked-parent');
  await mkdir(realParent);
  await writeFile(join(realParent, 'config.json'), original);
  try {
    await symlink(realParent, linkedParent, 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`directory symlinks unavailable: ${error.code}`);
      return;
    }
    throw error;
  }

  await assert.rejects(applyPatch({
    path: join(linkedParent, 'config.json'),
    expectedHash: sha256(original),
    content: 'replacement',
    backupDir,
  }), { code: 'PATCH_PATH_SYMLINK' });
  assert.deepEqual(await readFile(join(realParent, 'config.json')), original);
});

test('rejects a symlink backupDir', async (t) => {
  const { root, targetPath, original } = await fixture(t);
  const actualBackupDir = join(root, 'actual-backups');
  const linkedBackupDir = join(root, 'linked-backups');
  await mkdir(actualBackupDir);
  try {
    await symlink(actualBackupDir, linkedBackupDir, 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`directory symlinks unavailable: ${error.code}`);
      return;
    }
    throw error;
  }

  await assert.rejects(applyPatch({
    path: targetPath,
    expectedHash: sha256(original),
    content: 'replacement',
    backupDir: linkedBackupDir,
  }), { code: 'PATCH_BACKUP_PATH_SYMLINK' });
  assert.deepEqual(await readdir(actualBackupDir), []);
  assert.deepEqual(await readFile(targetPath), original);
});

test('rejects restoration when the saved original bytes no longer match originalHash', async (t) => {
  const { targetPath, backupDir, original } = await fixture(t);
  const receipt = await applyPatch({
    path: targetPath,
    expectedHash: sha256(original),
    content: 'patched',
    backupDir,
  });
  await writeFile(receipt.backupPath, 'tampered backup');

  await assert.rejects(restorePatch(receipt), { code: 'PATCH_BACKUP_HASH_MISMATCH' });
  assert.equal(await readFile(targetPath, 'utf8'), 'patched');
});
