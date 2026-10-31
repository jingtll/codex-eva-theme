import { open } from 'node:fs/promises';
import { TextDecoder } from 'node:util';

const MAX_HEADER_BYTES = 16 * 1024 * 1024;
const MAX_ENTRIES = 200_000;
const MAX_DEPTH = 64;
const decoder = new TextDecoder('utf-8', { fatal: true });

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function readExactly(handle, length, position, fileSize) {
  if (!Number.isSafeInteger(length) || length < 0 || position < 0 || position + length > fileSize) {
    throw fail('ASAR_HEADER_TRUNCATED');
  }
  const buffer = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const result = await handle.read(buffer, read, length - read, position + read);
    if (result.bytesRead === 0) throw fail('ASAR_HEADER_TRUNCATED');
    read += result.bytesRead;
  }
  return buffer;
}

function normalizeRequestedPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || value.includes('\\')) {
    throw fail('ASAR_PATH_INVALID');
  }
  const parts = value.split('/');
  if (value.startsWith('/') || parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw fail('ASAR_PATH_INVALID');
  }
  return parts.join('/');
}

function parseOffset(value) {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value >= 0) return value;
    throw fail('ASAR_ENTRY_INVALID');
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw fail('ASAR_ENTRY_INVALID');
  const offset = Number(value);
  if (!Number.isSafeInteger(offset)) throw fail('ASAR_ENTRY_INVALID');
  return offset;
}

function validateAndIndex(header, dataLength) {
  if (!header || typeof header !== 'object' || Array.isArray(header) ||
      !header.files || typeof header.files !== 'object' || Array.isArray(header.files)) {
    throw fail('ASAR_HEADER_INVALID');
  }

  const entries = new Map();
  let count = 0;

  function visit(nodes, parentPath, depth) {
    if (depth > MAX_DEPTH) throw fail('ASAR_HEADER_INVALID');
    for (const [name, node] of Object.entries(nodes)) {
      count += 1;
      if (count > MAX_ENTRIES) throw fail('ASAR_HEADER_INVALID');
      if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) {
        throw fail('ASAR_PATH_INVALID');
      }
      if (!node || typeof node !== 'object' || Array.isArray(node)) throw fail('ASAR_HEADER_INVALID');
      const archivePath = parentPath ? `${parentPath}/${name}` : name;
      if (Object.hasOwn(node, 'link')) throw fail('ASAR_ENTRY_UNSUPPORTED');

      if (Object.hasOwn(node, 'files')) {
        if (Object.hasOwn(node, 'size') || Object.hasOwn(node, 'offset') ||
            !node.files || typeof node.files !== 'object' || Array.isArray(node.files)) {
          throw fail('ASAR_HEADER_INVALID');
        }
        visit(node.files, archivePath, depth + 1);
        continue;
      }

      if (!Number.isSafeInteger(node.size) || node.size < 0) throw fail('ASAR_ENTRY_INVALID');
      if (node.unpacked === true) {
        entries.set(archivePath, { unpacked: true, size: node.size });
        continue;
      }
      const offset = parseOffset(node.offset);
      if (!Number.isSafeInteger(offset + node.size) || offset + node.size > dataLength) {
        throw fail('ASAR_ENTRY_INVALID');
      }
      entries.set(archivePath, { offset, size: node.size, unpacked: false });
    }
  }

  visit(header.files, '', 0);
  return entries;
}

/** Opens an ASAR archive for bounded, read-only text inspection. */
export async function openAsar(archivePath) {
  const handle = await open(archivePath, 'r');
  let closePromise;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 8) throw fail('ASAR_HEADER_TRUNCATED');

    const prefix = await readExactly(handle, 8, 0, stat.size);
    const firstPicklePayloadSize = prefix.readUInt32LE(0);
    const headerPickleSize = prefix.readUInt32LE(4);
    if (firstPicklePayloadSize !== 4 || headerPickleSize < 8 || headerPickleSize > MAX_HEADER_BYTES) {
      throw fail('ASAR_HEADER_INVALID');
    }

    const headerBytes = await readExactly(handle, headerPickleSize, 8, stat.size);
    const payloadSize = headerBytes.readUInt32LE(0);
    const stringSize = headerBytes.readUInt32LE(4);
    if (payloadSize !== headerPickleSize - 4 || stringSize < 2 || stringSize > headerPickleSize - 8) throw fail('ASAR_HEADER_INVALID');
    const jsonText = decoder.decode(headerBytes.subarray(8, 8 + stringSize));
    let header;
    try {
      header = JSON.parse(jsonText);
    } catch {
      throw fail('ASAR_HEADER_INVALID');
    }

    const dataStart = 8 + headerPickleSize;
    const entries = validateAndIndex(header, stat.size - dataStart);
    let closed = false;

    function ensureOpen() {
      if (closed) throw fail('ASAR_CLOSED');
    }

    return Object.freeze({
      list() {
        ensureOpen();
        return [...entries.keys()].sort();
      },
      async readText(requestedPath, maxBytes) {
        ensureOpen();
        const archiveEntryPath = normalizeRequestedPath(requestedPath);
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw fail('ASAR_SIZE_LIMIT');
        const entry = entries.get(archiveEntryPath);
        if (!entry || entry.unpacked) throw fail('ASAR_ENTRY_UNAVAILABLE');
        if (entry.size > maxBytes) throw fail('ASAR_SIZE_LIMIT');

        const bytes = await readExactly(handle, entry.size, dataStart + entry.offset, stat.size);
        try {
          return decoder.decode(bytes);
        } catch {
          throw fail('ASAR_TEXT_INVALID');
        }
      },
      close() {
        if (!closePromise) {
          closed = true;
          closePromise = handle.close();
        }
        return closePromise;
      },
    });
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
}
