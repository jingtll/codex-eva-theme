import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuota } from '../src/quota.mjs';

test('normalizes every modern quota bucket and clamps remaining percentages', () => {
  const nowMs = 1_760_000_000_123;
  const payload = {
    rateLimitsByLimitId: {
      codex: {
        name: 'Codex',
        primary: {
          name: 'Five hour',
          usedPercent: 125,
          resetsAt: 1_760_000_300,
          windowDurationMins: 300,
        },
        secondary: {
          usedPercent: -12,
          resetsAt: 1_760_604_800,
          windowDurationMins: 10_080,
        },
      },
      reviews: {
        name: 'Reviews',
        primary: {
          usedPercent: 25,
          resetsAt: null,
          windowDurationMins: 60,
        },
      },
    },
  };

  assert.deepEqual(normalizeQuota(payload, nowMs), {
    buckets: [
      {
        id: 'codex',
        name: 'Codex',
        windows: [
          {
            id: 'primary',
            name: 'Five hour',
            usedPercent: 125,
            remainingPercent: 0,
            resetsAt: 1_760_000_300,
            windowDurationMins: 300,
          },
          {
            id: 'secondary',
            name: 'secondary',
            usedPercent: -12,
            remainingPercent: 100,
            resetsAt: 1_760_604_800,
            windowDurationMins: 10_080,
          },
        ],
      },
      {
        id: 'reviews',
        name: 'Reviews',
        windows: [
          {
            id: 'primary',
            name: 'primary',
            usedPercent: 25,
            remainingPercent: 75,
            resetsAt: null,
            windowDurationMins: 60,
          },
        ],
      },
    ],
    updatedAt: nowMs,
  });
});

test('uses the modern bucket map before legacy rate limits and falls back to legacy data', () => {
  const legacy = {
    primary: { usedPercent: 10, resetsAt: 1_760_000_001, windowDurationMins: 5 },
    secondary: { usedPercent: 20, resetsAt: 1_760_000_002, windowDurationMins: 60 },
  };

  assert.deepEqual(
    normalizeQuota({ rateLimitsByLimitId: { account: { primary: legacy.primary } }, rateLimits: legacy }, 7),
    {
      buckets: [
        {
          id: 'account',
          name: 'account',
          windows: [
            {
              id: 'primary',
              name: 'primary',
              usedPercent: 10,
              remainingPercent: 90,
              resetsAt: 1_760_000_001,
              windowDurationMins: 5,
            },
          ],
        },
      ],
      updatedAt: 7,
    },
  );

  assert.deepEqual(normalizeQuota({ rateLimits: legacy }, 8), {
    buckets: [
      {
        id: 'legacy',
        name: 'legacy',
        windows: [
          {
            id: 'primary',
            name: 'primary',
            usedPercent: 10,
            remainingPercent: 90,
            resetsAt: 1_760_000_001,
            windowDurationMins: 5,
          },
          {
            id: 'secondary',
            name: 'secondary',
            usedPercent: 20,
            remainingPercent: 80,
            resetsAt: 1_760_000_002,
            windowDurationMins: 60,
          },
        ],
      },
    ],
    updatedAt: 8,
  });
});

test('keeps invalid or missing usage unavailable instead of reporting full remaining quota', () => {
  const normalized = normalizeQuota(
    {
      rateLimitsByLimitId: {
        account: {
          primary: { usedPercent: null, resetsAt: 'tomorrow', windowDurationMins: '300' },
          secondary: { resetsAt: 1_760_000_001 },
          tertiary: { usedPercent: Number.POSITIVE_INFINITY },
        },
      },
    },
    9,
  );

  assert.deepEqual(normalized.buckets[0].windows, [
    {
      id: 'primary',
      name: 'primary',
      usedPercent: null,
      remainingPercent: null,
      resetsAt: null,
      windowDurationMins: null,
    },
    {
      id: 'secondary',
      name: 'secondary',
      usedPercent: null,
      remainingPercent: null,
      resetsAt: 1_760_000_001,
      windowDurationMins: null,
    },
    {
      id: 'tertiary',
      name: 'tertiary',
      usedPercent: null,
      remainingPercent: null,
      resetsAt: null,
      windowDurationMins: null,
    },
  ]);
});
