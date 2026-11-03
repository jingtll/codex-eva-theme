import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('download archive contains a runnable companion and no local installation data', { skip: process.platform !== 'win32' }, async (t) => {
  // Host-managed TEMP rejects unsigned scripts; use the same local cache as launcher tests.
  const cache = fileURLToPath(new URL('../.cache/', import.meta.url));
  await mkdir(cache, { recursive: true });
  const temporary = await mkdtemp(join(cache, 'eva-release-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const output = join(temporary, 'output');
  execFileSync(process.execPath, ['tools/package-release.mjs', '--output', output], { cwd: new URL('../', import.meta.url), stdio: 'pipe' });
  const archive = (await readdir(output)).find(name => name.endsWith('.zip'));
  assert.ok(archive);
  const bytes = await readFile(join(output, archive));
  assert.equal(await readFile(join(output, 'SHA256SUMS.txt'), 'utf8'), `${createHash('sha256').update(bytes).digest('hex')}  ${archive}\n`);
  const unpacked = join(temporary, 'unpacked');
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:EVA_TEST_ZIP -DestinationPath $env:EVA_TEST_DEST'], {
    env: { ...process.env, EVA_TEST_ZIP: join(output, archive), EVA_TEST_DEST: unpacked }, stdio: 'pipe',
  });
  const root = join(unpacked, archive.slice(0, -4));
  const manifest = JSON.parse(await readFile(join(root, 'release-manifest.json'), 'utf8'));
  assert.equal(manifest.version, JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version);
  assert.equal(manifest.assetAuthorization, 'pending');
  for (const path of ['companion/src/main.mjs', 'companion/windows/ClickLauncher.cs', 'companion/windows/shortcut.ps1', 'companion/assets/audio/rei-voice-complete.mp3', 'docs/validation/entry-probe.md', 'docs/theme-tokens.md', 'docs/screenshots/codex-asuka-dark.png', 'docs/screenshots/codex-rei-light.png', 'docs/screenshots/codex-display-settings.png', 'docs/screenshots/README.md', 'share/share-asuka-dark.txt', 'QUICKSTART.md', 'LICENSE']) {
    assert.ok(manifest.files.some(file => file.path === path), `missing ${path}`);
  }
  assert.ok(!manifest.files.some(file => /(^|\/)(\.git|\.cache|build|node_modules|dsh-plugin-eva-theme)(\/|$)|\.lnk$|receipt.*\.json$/.test(file.path)));
  for (const file of manifest.files) {
    assert.equal(createHash('sha256').update(await readFile(join(root, file.path))).digest('hex'), file.sha256, file.path);
  }
  const { buildBundle } = await import(pathToFileURL(join(root, 'companion/src/bundle.mjs')));
  assert.match(await buildBundle(), /data:image\/png;base64,/);
  const { selectAdapter, MCP_VIEW_V1 } = await import(pathToFileURL(join(root, 'companion/src/adapters/index.mjs')));
  assert.equal(selectAdapter({ fingerprint: MCP_VIEW_V1.fingerprints[0], probeRecord: await readFile(join(root, 'docs/validation/entry-probe.md'), 'utf8') }).status, 'verified');
  execFileSync(process.execPath, ['tools/build.mjs', '--check'], { cwd: root, stdio: 'pipe' });
  execFileSync(process.execPath, ['tools/verify.mjs'], { cwd: root, stdio: 'pipe' });
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', join(root, 'companion/windows/build-launcher.ps1')], { stdio: 'pipe' });
  const again = (() => {
    try { execFileSync(process.execPath, ['tools/package-release.mjs', '--output', output], { cwd: new URL('../', import.meta.url), stdio: 'pipe' }); }
    catch (error) { return error; }
  })();
  assert.ok(again, 'existing release output must not be overwritten');
  assert.equal(createHash('sha256').update(await readFile(join(output, archive))).digest('hex'), createHash('sha256').update(bytes).digest('hex'));
});
