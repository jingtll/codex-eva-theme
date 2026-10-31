/**
 * Host message contract for the Codex build verified in docs/validation/entry-probe.md.
 *
 * Every method name the page relies on lives here, keyed by what it is for. A new
 * Codex build whose resources no longer match is reported as unsupported rather
 * than silently reusing these names, per the design's "版本适配器" rule.
 */
export const MCP_VIEW_V1 = Object.freeze({
  id: 'mcp-view-1',
  // Resource-fingerprint values this contract was verified against. Adding a
  // fingerprint requires a new probe run recorded in docs/validation/.
  fingerprints: Object.freeze(['2cde1c59f255f5828fd97b93bf31eb988134c38c3bca8ef4e16e7fc255730fb1']),
  origin: 'app://-',
  // Verified: responses arrive as window "message" events with type mcp-response.
  transport: 'window-message',
  methods: Object.freeze({
    quotaRead: 'account/rateLimits/read',
    quotaPush: 'account/rateLimits/updated',
    rateLimited: 'account/rateLimits/rateLimited',
    accountChanged: 'account/updated',
    loginCompleted: 'account/login/completed',
    threadStarted: 'thread/started',
    threadRead: 'thread/read',
    turnCompleted: 'turn/completed',
  }),
  // Approval requests end with one of these until a build is probed for more.
  approvalSuffixes: Object.freeze(['/requestApproval', '/requestUserInput']),
  // Bridge methods the page must find before a transport can be used at all.
  requiredBridge: Object.freeze(['sendMessageFromView']),
});

export const AVAILABLE_ADAPTERS = Object.freeze([MCP_VIEW_V1]);

const SHA256 = /^[a-f0-9]{64}$/;

/** Reads the single fingerprint a probe record marks as current. */
export function currentFingerprint(probeRecord) {
  if (typeof probeRecord !== 'string') return null;
  const match = probeRecord.match(/当前指纹[^\n]*?`([a-f0-9]{64})`/);
  return match ? match[1] : null;
}

/**
 * Picks the adapter whose fingerprint matches the running client.
 *
 * @returns {{status: 'verified', adapter: object, fingerprint: string}
 *         | {status: 'unsupported', adapter: null, reason: string, fingerprint: string|null}}
 */
export function selectAdapter({ fingerprint, probeRecord, adapters = AVAILABLE_ADAPTERS } = {}) {
  const normalized = typeof fingerprint === 'string' && SHA256.test(fingerprint) ? fingerprint : null;
  if (!normalized) {
    return { status: 'unsupported', adapter: null, reason: '资源指纹缺失或格式无效', fingerprint: null };
  }
  const current = currentFingerprint(probeRecord);
  if (current !== normalized) {
    return {
      status: 'unsupported',
      adapter: null,
      reason: '当前 Codex 版本的资源指纹未验证，已停用事件适配',
      fingerprint: normalized,
    };
  }
  const adapter = adapters.find((candidate) =>
    (candidate.fingerprints ?? []).includes(normalized));
  if (!adapter) {
    return {
      status: 'unsupported',
      adapter: null,
      reason: '资源指纹没有对应的已验证适配器，已停用事件适配',
      fingerprint: normalized,
    };
  }
  return { status: 'verified', adapter, fingerprint: normalized };
}
