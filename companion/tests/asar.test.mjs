import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openAsar } from '../src/asar.mjs';

function makeAsar(entries) {
  const files = {};
  const contents = [];
  let offset = 0;

  for (const [name, value] of Object.entries(entries)) {
    const data = Buffer.from(value.text ?? '');
    files[name] = { size: value.size ?? data.length, offset: value.offset ?? String(offset) };
    if (value.includeData !== false) {
      contents.push(data);
      offset += data.length;
    }
  }

  const json = Buffer.from(JSON.stringify({ files: nestFiles(files) }));
  const pickleSize = 8 + Math.ceil(json.length / 4) * 4;
  const firstPickle = Buffer.alloc(8);
  firstPickle.writeUInt32LE(4, 0);
  firstPickle.writeUInt32LE(pickleSize, 4);

  const headerPickle = Buffer.alloc(pickleSize);
  headerPickle.writeUInt32LE(pickleSize - 4, 0);
  headerPickle.writeUInt32LE(json.length, 4);
  json.copy(headerPickle, 8);
  return Buffer.concat([firstPickle, headerPickle, ...contents]);
}

function nestFiles(flatEntries) {
  const root = {};
  for (const [archivePath, node] of Object.entries(flatEntries)) {
    const parts = archivePath.split('/');
    let parent = root;
    for (const part of parts.slice(0, -1)) {
      parent[part] ??= { files: {} };
      parent = parent[part].files;
    }
    parent[parts.at(-1)] = node;
  }
  return root;
}

async function withArchive(t, bytes) {
  const dir = await mkdtemp(join(tmpdir(), 'eva-asar-'));
  const archivePath = join(dir, 'mini.asar');
  await writeFile(archivePath, bytes);
  t.after(() => rm(dir, { recursive: true, force: true }));
  return archivePath;
}

test('reads a text entry from a minimal ASAR and lists file paths', async (t) => {
  const archivePath = await withArchive(t, makeAsar({
    'package.json': { text: '{"version":"1.2.3"}' },
    'webview/index.html': { text: '<main>Codex</main>' },
  }));
  const archive = await openAsar(archivePath);

  assert.deepEqual(archive.list(), ['package.json', 'webview/index.html']);
  assert.equal(await archive.readText('webview/index.html', 128), '<main>Codex</main>');
  await archive.close();
});

test('rejects a truncated ASAR header', async (t) => {
  const archivePath = await withArchive(t, Buffer.from([0x08, 0x00, 0x00]));
  await assert.rejects(openAsar(archivePath), /ASAR_HEADER_TRUNCATED/);
});

test('rejects a truncated header pickle or JSON string', async (t) => {
  const bytes = makeAsar({ 'a.txt': { text: 'a' } }).subarray(0, 12);
  const archivePath = await withArchive(t, bytes);
  await assert.rejects(openAsar(archivePath), /ASAR_HEADER_TRUNCATED/);
});

test('rejects an invalid file offset before exposing the archive', async (t) => {
  const archivePath = await withArchive(t, makeAsar({
    'bad.txt': { text: 'x', offset: '-1' },
  }));
  await assert.rejects(openAsar(archivePath), /ASAR_ENTRY_INVALID/);
});

test('rejects archive entries that escape their parent directory', async (t) => {
  const archivePath = await withArchive(t, makeAsar({ '../outside.txt': { text: 'secret' } }));
  await assert.rejects(openAsar(archivePath), /ASAR_PATH_INVALID/);
});

test('enforces readText byte limits and rejects unsafe requested paths', async (t) => {
  const archivePath = await withArchive(t, makeAsar({ 'nested/info.txt': { text: 'hello' } }));
  const archive = await openAsar(archivePath);

  await assert.rejects(archive.readText('nested/info.txt', 4), /ASAR_SIZE_LIMIT/);
  await assert.rejects(archive.readText('../info.txt', 20), /ASAR_PATH_INVALID/);
  await archive.close();
});

test('close is idempotent and closes further reads', async (t) => {
  const archivePath = await withArchive(t, makeAsar({ 'a.txt': { text: 'a' } }));
  const archive = await openAsar(archivePath);

  await archive.close();
  await archive.close();
  await assert.rejects(archive.readText('a.txt', 10), /ASAR_CLOSED/);
});
