import { createHash } from 'node:crypto';
import { openAsar } from './asar.mjs';

const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const NUL = String.fromCharCode(0);

// Same entry-selection rule the diagnostic uses, so the two never disagree.
function entryPaths(files) {
  return [
    '.vite/build/early-bootstrap.js',
    files.find((file) => /^\.vite\/build\/main(?:[-.][^/]+)?\.js$/i.test(file)) ?? null,
    files.find((file) => /^\.vite\/build\/preload(?:[-.][^/]+)?\.js$/i.test(file)) ?? null,
    files.includes('webview/index.html') ? 'webview/index.html' : null,
  ].filter(Boolean);
}

/** Read-only resource fingerprint of the client's entry bundles. */
export async function resourceFingerprint(asarPath) {
  const archive = await openAsar(asarPath);
  try {
    const hashes = [];
    for (const entry of entryPaths(archive.list())) {
      try {
        const content = await archive.readText(entry, MAX_ENTRY_BYTES);
        hashes.push(`${entry}${NUL}${createHash('sha256').update(content, 'utf8').digest('hex')}`);
      } catch {
        hashes.push(`${entry}${NUL}unreadable`);
      }
    }
    if (hashes.length === 0) return null;
    return createHash('sha256').update(hashes.sort().join('\n')).digest('hex');
  } finally {
    await archive.close();
  }
}
