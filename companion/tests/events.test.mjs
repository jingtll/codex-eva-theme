import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier } from '../src/events.mjs';

const event = (overrides = {}) => ({
  hostId: 'local',
  threadId: 'thread-a',
  turnId: 'turn-1',
  type: 'completed',
  status: 'completed',
  isSubagent: false,
  replay: false,
  ...overrides,
});

test('notifies once for approval and once for normal completion on the same turn', () => {
  const notifier = createNotifier();
  const approval = event({ type: 'approval', status: 'approval' });

  assert.deepEqual(notifier.accept(approval), {
    kind: 'approval', hostId: 'local', threadId: 'thread-a', turnId: 'turn-1',
  });
  assert.equal(notifier.accept(approval), null);

  assert.deepEqual(notifier.accept(event()), {
    kind: 'completed', hostId: 'local', threadId: 'thread-a', turnId: 'turn-1',
  });
  assert.equal(notifier.accept(event()), null);
});

test('ignores replayed events, subagents, and failed or cancelled completions', () => {
  const notifier = createNotifier();

  assert.equal(notifier.accept(event({ replay: true })), null);
  assert.equal(notifier.accept(event({ replay: undefined, turnId: 'turn-no-replay-flag' })), null);
  assert.equal(notifier.accept(event({ isSubagent: true })), null);
  assert.equal(notifier.accept(event({ isSubagent: undefined })), null);
  assert.equal(notifier.accept(event({ hostId: Number.NaN })), null);
  assert.equal(notifier.accept(event({ status: 'failed' })), null);
  assert.equal(notifier.accept(event({ status: 'cancelled' })), null);
  assert.equal(notifier.accept(event({ type: 'started', status: 'inProgress' })), null);
  assert.deepEqual(notifier.accept(event()), {
    kind: 'completed', hostId: 'local', threadId: 'thread-a', turnId: 'turn-1',
  });
});

test('deduplicates by host, thread, turn, and event type', () => {
  const notifier = createNotifier();
  const base = event();

  assert.notEqual(notifier.accept(base), null);
  assert.notEqual(notifier.accept(event({ hostId: 'remote' })), null);
  assert.notEqual(notifier.accept(event({ threadId: 'thread-b' })), null);
  assert.notEqual(notifier.accept(event({ turnId: 'turn-2' })), null);
  assert.notEqual(notifier.accept(event({ type: 'approval', status: 'approval' })), null);
  assert.equal(notifier.accept(base), null);
});

test('bounds retained deduplication keys and accepts an event again after eviction', () => {
  const notifier = createNotifier({ maxEntries: 2 });
  const first = event({ turnId: 'turn-1' });
  const second = event({ turnId: 'turn-2' });
  const third = event({ turnId: 'turn-3' });

  assert.notEqual(notifier.accept(first), null);
  assert.notEqual(notifier.accept(second), null);
  assert.notEqual(notifier.accept(third), null);
  assert.notEqual(notifier.accept(first), null);
  assert.equal(notifier.accept(first), null);
});
