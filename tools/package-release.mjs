import { readFile, writeFile, mkdir, mkdtemp, copyFile, lstat, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { output: { type: 'string' } } });
if (process.platform !== 'win32') throw new Error('Release packaging requires Windows PowerShell 5.1.');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(pkg.version)) throw new Error('Expected a stable or beta version.');
const name = `codex-eva-theme-v${pkg.version}-windows`;
const output = resolve(values.output ?? join(root, 'dist', 'releases', pkg.version));
// Snapshot source state before an unignored custom output can change it.
const sourceTreeDirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim());
// Never replace an existing artifact or delete a caller-provided directory.
await mkdir(dirname(output), { recursive: true });
await mkdir(output, { recursive: false });
const staging = await mkdtemp(join(output, '.staging-'));
try {
  const destination = join(staging, name);
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const files = tracked.filter(path =>
    ['README.md', 'QUICKSTART.md', 'LICENSE', 'package.json', 'companion/package.json', 'companion/README.md', 'companion/NOTICE.md', 'docs/theme-tokens.md'].includes(path) ||
    /^(share|themes|tools)\//.test(path) ||
    /^companion\/(src|client|assets|windows)\//.test(path) ||
    /^docs\/(validation|release|screenshots)\//.test(path));
  for (const required of ['QUICKSTART.md', 'companion/src/main.mjs', 'docs/validation/entry-probe.md']) {
    if (!files.includes(required)) throw new Error(`Required release file must be tracked: ${required}`);
  }
  const manifest = {
    version: pkg.version,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceTreeDirty,
    assetAuthorization: 'pending',
    cleanMachineAcceptance: 'pending',
    files: [],
  };
  for (const path of files.sort()) {
    const source = join(root, path);
    if (!(await lstat(source)).isFile()) throw new Error(`Only regular files are allowed: ${path}`);
    const target = join(destination, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    manifest.files.push({ path, sha256: createHash('sha256').update(await readFile(target)).digest('hex') });
  }
  await writeFile(join(destination, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const archive = join(output, `${name}.zip`);
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Compress-Archive -LiteralPath $env:EVA_RELEASE_SOURCE -DestinationPath $env:EVA_RELEASE_ZIP -CompressionLevel Optimal"], {
    env: { ...process.env, EVA_RELEASE_SOURCE: destination, EVA_RELEASE_ZIP: archive }, stdio: 'pipe',
  });
  const hash = createHash('sha256').update(await readFile(archive)).digest('hex');
  await writeFile(join(output, 'SHA256SUMS.txt'), `${hash}  ${name}.zip\n`);
  console.log(JSON.stringify({ archive, sha256: hash, sourceCommit: manifest.sourceCommit, sourceTreeDirty: manifest.sourceTreeDirty, files: files.length }));
} finally {
  // staging is created by mkdtemp directly inside this build's new output.
  await rm(staging, { recursive: true, force: true });
}
