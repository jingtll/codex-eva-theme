import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectAdapter } from '../src/adapters/index.mjs';

const verified = await readFile(new URL('../../docs/validation/entry-probe.md', import.meta.url), 'utf8');
// The record marks exactly one fingerprint as current; earlier probes stay listed as history.
const verifiedFingerprint = verified.match(/当前指纹[^\n]*?`([a-f0-9]{64})`/)[1];

test('a fingerprint verified in the probe record selects the verified adapter', () => {
  const result = selectAdapter({ fingerprint: verifiedFingerprint, probeRecord: verified });
  assert.equal(result.status, 'verified');
  assert.equal(result.adapter.id, 'mcp-view-1');
  // The method names travel with the adapter, not with the call site.
  assert.deepEqual(Object.keys(result.adapter.methods).sort(), [
    'accountChanged', 'loginCompleted', 'quotaPush', 'quotaRead', 'rateLimited', 'threadRead', 'threadStarted', 'turnCompleted',
  ]);
});

test('an unknown fingerprint reports unsupported instead of reusing the verified offsets', () => {
  const result = selectAdapter({ fingerprint: 'a'.repeat(64), probeRecord: verified });
  assert.equal(result.status, 'unsupported');
  assert.equal(result.adapter, null);
  assert.match(result.reason, /未验证|没有对应/);
});

test('an adapter only matches fingerprints it lists, even when the record agrees', () => {
  const options = {
    fingerprint: verifiedFingerprint,
    probeRecord: verified,
    adapters: [{
      id: 'other', fingerprints: ['c'.repeat(64)], origin: 'app://-',
      methods: { turnCompleted: 'turn/completed' },
    }],
  };
  const result = selectAdapter(options);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.adapter, null);
});

test('a missing or malformed fingerprint never falls back silently', () => {
  for (const fingerprint of [undefined, null, '', 'not-a-hash', 'A'.repeat(64)]) {
    const result = selectAdapter({ fingerprint, probeRecord: verified });
    assert.equal(result.status, 'unsupported');
    assert.equal(result.adapter, null);
  }
});

test('a fingerprint listed in the record is only trusted when it is the one being verified', () => {
  // The record also mentions earlier probes; only the current one counts.
  const withHistory = `${verified}\n\n## 历史\n旧版本指纹：\`${'b'.repeat(64)}\``;
  assert.equal(selectAdapter({ fingerprint: 'b'.repeat(64), probeRecord: withHistory }).status, 'unsupported');
  assert.equal(selectAdapter({ fingerprint: verifiedFingerprint, probeRecord: withHistory }).status, 'verified');
});

test('the verified adapter only ever issues methods it declares', () => {
  const { adapter } = selectAdapter({ fingerprint: verifiedFingerprint, probeRecord: verified });
  for (const [key, value] of Object.entries(adapter.methods)) {
    assert.equal(typeof value, 'string', `${key} must be a method name`);
    assert.ok(value.length > 0 && !/\s/.test(value));
  }
  assert.equal(adapter.origin, 'app://-');
});
