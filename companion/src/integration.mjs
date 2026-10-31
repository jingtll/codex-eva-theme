import { randomUUID, createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rmdir,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';

const RECEIPT_VERSION = 1;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const RECEIPT_KEYS = [
  'version', 'id', 'path', 'backupDir', 'backupPath', 'receiptPath', 'originalHash', 'patchedHash',
];
const SORTED_RECEIPT_KEYS = [...RECEIPT_KEYS].sort();

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fileBytes(content) {
  if (typeof content === 'string') return Buffer.from(content, 'utf8');
  if (Buffer.isBuffer(content) || content instanceof Uint8Array) return Buffer.from(content);
  throw fail('PATCH_INPUT_INVALID', 'content must be a string or byte array');
}

function absolutePath(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw fail('PATCH_INPUT_INVALID', `${field} must be a non-empty path`);
  }
  return path.resolve(value);
}

function pathParts(absolute) {
  const root = path.parse(absolute).root;
  return {
    root,
    parts: absolute.slice(root.length).split(path.sep).filter(Boolean),
  };
}

async function inspectPath(absolute, code, { allowMissing = false } = {}) {
  const { root, parts } = pathParts(absolute);
  let current = root;
  let info = await lstat(root).catch((error) => {
    if (allowMissing && error.code === 'ENOENT') return null;
    throw error;
  });
  if (!info) return null;
  if (info.isSymbolicLink()) throw fail(code, `symbolic link is not allowed: ${current}`);

  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    try {
      info = await lstat(current);
    } catch (error) {
      if (allowMissing && error.code === 'ENOENT') return null;
      throw error;
    }
    if (info.isSymbolicLink()) throw fail(code, `symbolic link is not allowed: ${current}`);
    if (index < parts.length - 1 && !info.isDirectory()) {
      throw fail(code, `path component is not a directory: ${current}`);
    }
  }
  return info;
}

async function ensureSecureDirectory(absolute, code) {
  const { root, parts } = pathParts(absolute);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (createError) {
        if (createError.code !== 'EEXIST') throw createError;
      }
      info = await lstat(current);
    }
    if (info.isSymbolicLink()) throw fail(code, `symbolic link is not allowed: ${current}`);
    if (!info.isDirectory()) throw fail(code, `directory path contains a non-directory: ${current}`);
  }
  return await lstat(absolute);
}

async function readRegularFile(absolute, code) {
  const info = await inspectPath(absolute, code);
  if (!info.isFile()) throw fail(code, `expected a regular file: ${absolute}`);
  const bytes = await readFile(absolute);
  const confirmed = await inspectPath(absolute, code);
  if (!confirmed.isFile()) throw fail(code, `expected a regular file: ${absolute}`);
  return { bytes, mode: info.mode & 0o777 };
}

async function writeExclusive(filePath, bytes, mode) {
  const handle = await open(filePath, 'wx', mode);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function replaceFile(absolute, bytes, expectedCurrentHash, conflictCode, mode) {
  const parent = path.dirname(absolute);
  await inspectPath(parent, conflictCode);
  const current = await readRegularFile(absolute, conflictCode);
  if (hash(current.bytes) !== expectedCurrentHash) throw fail(conflictCode);

  const temporary = path.join(parent, `.${path.basename(absolute)}.eva-${randomUUID()}.tmp`);
  try {
    await writeExclusive(temporary, bytes, mode ?? current.mode);
    await inspectPath(parent, conflictCode);
    const finalCurrent = await readRegularFile(absolute, conflictCode);
    if (hash(finalCurrent.bytes) !== expectedCurrentHash) throw fail(conflictCode);
    await rename(temporary, absolute);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

function patchPaths(backupDir, id) {
  const operationDir = path.join(backupDir, id);
  return {
    operationDir,
    backupPath: path.join(operationDir, 'original.bin'),
    receiptPath: path.join(operationDir, 'receipt.json'),
  };
}

function validateReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) ||
      Object.getPrototypeOf(receipt) !== Object.prototype) {
    throw fail('PATCH_RECEIPT_INVALID');
  }
  const keys = Object.keys(receipt).sort();
  if (keys.length !== RECEIPT_KEYS.length ||
      keys.some((key, index) => key !== SORTED_RECEIPT_KEYS[index]) ||
      receipt.version !== RECEIPT_VERSION ||
      typeof receipt.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.id) ||
      !HASH_PATTERN.test(receipt.originalHash) || !HASH_PATTERN.test(receipt.patchedHash) ||
      ['path', 'backupDir', 'backupPath', 'receiptPath'].some((key) =>
        typeof receipt[key] !== 'string' || receipt[key].length === 0 || receipt[key].includes('\0'))) {
    throw fail('PATCH_RECEIPT_INVALID');
  }

  const targetPath = absolutePath(receipt.path, 'receipt.path');
  const backupDir = absolutePath(receipt.backupDir, 'receipt.backupDir');
  const backupPath = absolutePath(receipt.backupPath, 'receipt.backupPath');
  const receiptPath = absolutePath(receipt.receiptPath, 'receipt.receiptPath');
  const expectedPaths = patchPaths(backupDir, receipt.id);
  if (targetPath !== receipt.path || backupDir !== receipt.backupDir ||
      backupPath !== expectedPaths.backupPath || receiptPath !== expectedPaths.receiptPath) {
    throw fail('PATCH_RECEIPT_INVALID');
  }
  return { targetPath, backupDir, ...expectedPaths };
}

function sameReceipt(left, right) {
  return RECEIPT_KEYS.every((key) => left[key] === right[key]);
}

/**
 * Atomically replaces a regular configuration file after checking its expected SHA-256.
 * The original bytes and a JSON receipt are saved in an operation-specific backup directory.
 */
export async function applyPatch({ path: requestedPath, expectedHash, content, backupDir: requestedBackupDir } = {}) {
  const targetPath = absolutePath(requestedPath, 'path');
  const backupDir = absolutePath(requestedBackupDir, 'backupDir');
  if (typeof expectedHash !== 'string' || !HASH_PATTERN.test(expectedHash)) {
    throw fail('PATCH_INPUT_INVALID', 'expectedHash must be a lowercase SHA-256 digest');
  }
  const patchedBytes = fileBytes(content);
  const target = await readRegularFile(targetPath, 'PATCH_PATH_SYMLINK');
  const originalHash = hash(target.bytes);
  if (originalHash !== expectedHash) throw fail('PATCH_EXPECTED_HASH_MISMATCH');

  await ensureSecureDirectory(backupDir, 'PATCH_BACKUP_PATH_SYMLINK');
  const id = randomUUID();
  const { operationDir, backupPath, receiptPath } = patchPaths(backupDir, id);
  await mkdir(operationDir, { mode: 0o700 });
  const receipt = {
    version: RECEIPT_VERSION,
    id,
    path: targetPath,
    backupDir,
    backupPath,
    receiptPath,
    originalHash,
    patchedHash: hash(patchedBytes),
  };

  await writeExclusive(backupPath, target.bytes, 0o600);
  await writeExclusive(receiptPath, Buffer.from(`${JSON.stringify(receipt)}\n`), 0o600);
  await replaceFile(targetPath, patchedBytes, originalHash, 'PATCH_EXPECTED_HASH_MISMATCH', target.mode);
  return receipt;
}

/** Restores a prior patch only while the target still exactly matches that receipt. */
export async function restorePatch(receipt) {
  const paths = validateReceipt(receipt);
  const backupRoot = await inspectPath(paths.backupDir, 'PATCH_BACKUP_PATH_SYMLINK');
  if (!backupRoot?.isDirectory()) throw fail('PATCH_RECEIPT_INVALID');
  const operationInfo = await inspectPath(paths.operationDir, 'PATCH_BACKUP_PATH_SYMLINK');
  if (!operationInfo?.isDirectory()) throw fail('PATCH_RECEIPT_INVALID');
  const storedReceipt = await readRegularFile(paths.receiptPath, 'PATCH_RECEIPT_INVALID');
  let parsed;
  try {
    parsed = JSON.parse(storedReceipt.bytes.toString('utf8'));
  } catch {
    throw fail('PATCH_RECEIPT_INVALID');
  }
  try {
    validateReceipt(parsed);
  } catch {
    throw fail('PATCH_RECEIPT_INVALID');
  }
  if (!sameReceipt(receipt, parsed)) throw fail('PATCH_RECEIPT_INVALID');

  const backup = await readRegularFile(paths.backupPath, 'PATCH_BACKUP_INVALID');
  if (hash(backup.bytes) !== receipt.originalHash) throw fail('PATCH_BACKUP_HASH_MISMATCH');
  const target = await readRegularFile(paths.targetPath, 'PATCH_PATH_SYMLINK');
  if (hash(target.bytes) !== receipt.patchedHash) throw fail('PATCH_RESTORE_CONFLICT');
  await replaceFile(paths.targetPath, backup.bytes, receipt.patchedHash, 'PATCH_RESTORE_CONFLICT', target.mode);
  return { restoredHash: receipt.originalHash, receiptPath: paths.receiptPath };
}
