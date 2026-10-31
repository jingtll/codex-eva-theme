const isIdentifier = (value) =>
  (typeof value === 'string' && value.length > 0) || (typeof value === 'number' && Number.isFinite(value));

export function createNotifier({ maxEntries = 1000 } = {}) {
  const limit = Number.isSafeInteger(maxEntries) && maxEntries > 0 ? maxEntries : 1000;
  const seen = new Map();

  function accept(event) {
    if (event === null || typeof event !== 'object') return null;
    if (event.isSubagent !== false || event.replay !== false) return null;
    if (!isIdentifier(event.hostId) || !isIdentifier(event.threadId) || !isIdentifier(event.turnId)) return null;

    let kind;
    if (event.type === 'approval') {
      kind = 'approval';
    } else if (event.type === 'completed' && event.status === 'completed') {
      kind = 'completed';
    } else {
      return null;
    }

    const key = JSON.stringify([event.hostId, event.threadId, event.turnId, event.type]);
    if (seen.has(key)) return null;

    seen.set(key, true);
    if (seen.size > limit) seen.delete(seen.keys().next().value);

    return {
      kind,
      hostId: event.hostId,
      threadId: event.threadId,
      turnId: event.turnId,
    };
  }

  return { accept };
}
