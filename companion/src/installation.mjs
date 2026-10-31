import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const RECEIPT_VERSION = 1;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function samePath(left, right) {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function parseRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) return null;
  if (isAbsolute(value) || /^[a-z]:/i.test(value) || value.startsWith('\\')) return null;
  const parts = value.split(/[\\/]/);
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return null;
  return parts;
}

async function existingRegularFileUnder(root, parts) {
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = resolve(current, part);
    if (!inside(root, current)) return null;
    let info;
    try {
      info = await lstat(current);
    } catch {
      return null;
    }
    if (info.isSymbolicLink()) return null;
    if (index < parts.length - 1 && !info.isDirectory()) return null;
    if (index === parts.length - 1 && !info.isFile()) return null;
  }

  let actualPath;
  try {
    actualPath = await realpath(current);
  } catch {
    return null;
  }
  return inside(root, actualPath) ? current : null;
}

async function hashFile(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

export async function createFileReceipt(rootPath, absoluteFilePaths) {
  if (!Array.isArray(absoluteFilePaths)) throw new TypeError('INSTALL_PATH_INVALID');
  const root = await realpath(resolve(rootPath));
  const entries = [];
  const seen = new Set();

  for (const filePath of absoluteFilePaths) {
    if (typeof filePath !== 'string' || !isAbsolute(filePath)) throw new Error('INSTALL_PATH_INVALID');
    const candidate = resolve(filePath);
    if (!inside(root, candidate) || samePath(root, candidate)) throw new Error('INSTALL_PATH_INVALID');
    const rel = relative(root, candidate);
    const parts = rel.split(sep);
    if (parts.some((part) => part === '' || part === '.' || part === '..')) throw new Error('INSTALL_PATH_INVALID');
    const safePath = await existingRegularFileUnder(root, parts);
    if (!safePath) throw new Error('INSTALL_PATH_INVALID');
    const receiptPath = parts.join('/');
    const key = process.platform === 'win32' ? receiptPath.toLowerCase() : receiptPath;
    if (seen.has(key)) throw new Error('INSTALL_PATH_INVALID');
    seen.add(key);
    entries.push({ path: receiptPath, sha256: await hashFile(safePath) });
  }

  entries.sort((left, right) => left.path.localeCompare(right.path));
  return { version: RECEIPT_VERSION, files: entries };
}

export async function listUnmodifiedReceiptFiles(rootPath, receipt) {
  if (receipt?.version !== RECEIPT_VERSION || !Array.isArray(receipt.files)) return [];
  let root;
  try {
    root = await realpath(resolve(rootPath));
  } catch {
    return [];
  }

  const candidates = [];
  const seen = new Set();
  for (const entry of receipt.files) {
    if (!entry || !SHA256_PATTERN.test(entry.sha256 ?? '')) continue;
    const parts = parseRelativePath(entry.path);
    if (!parts) continue;
    const receiptPath = parts.join('/');
    const key = process.platform === 'win32' ? receiptPath.toLowerCase() : receiptPath;
    if (seen.has(key)) continue;
    seen.add(key);
    const filePath = await existingRegularFileUnder(root, parts);
    if (!filePath) continue;
    if ((await hashFile(filePath)).toLowerCase() === entry.sha256.toLowerCase()) {
      candidates.push(receiptPath);
    }
  }
  return candidates;
}

async function writeReceiptFromCli(options) {
  const root = await realpath(resolve(options.root));
  const outputPath = resolve(options.output);
  if (!inside(root, outputPath) || samePath(root, outputPath)) throw new Error('INSTALL_PATH_INVALID');
  const outputParent = await realpath(dirname(outputPath));
  if (!inside(root, outputParent)) throw new Error('INSTALL_PATH_INVALID');
  try {
    const outputInfo = await lstat(outputPath);
    if (outputInfo.isSymbolicLink() || !outputInfo.isFile()) throw new Error('INSTALL_PATH_INVALID');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const paths = JSON.parse(await readFile(options.pathsFile, 'utf8'));
  const files = await createFileReceipt(root, paths);
  const receipt = { ...files, ...(options.metadataFile ? JSON.parse(await readFile(options.metadataFile, 'utf8')) : {}) };
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  await rename(temporaryPath, outputPath);
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith('--') || index + 1 >= args.length) throw new Error('INSTALL_ARGUMENT_INVALID');
    options[key.slice(2)] = args[index + 1];
    index += 1;
  }
  return options;
}

async function runCli(args) {
  const [command, ...rest] = args;
  const options = parseOptions(rest);
  if (command === 'list-unmodified') {
    const receipt = JSON.parse(await readFile(options.receipt, 'utf8'));
    process.stdout.write(`${JSON.stringify(await listUnmodifiedReceiptFiles(options.root, receipt))}\n`);
    return;
  }
  if (command === 'write-receipt') {
    await writeReceiptFromCli(options);
    return;
  }
  throw new Error('INSTALL_COMMAND_INVALID');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error?.message || 'INSTALL_OPERATION_FAILED'}\n`);
    process.exitCode = 1;
  });
}
