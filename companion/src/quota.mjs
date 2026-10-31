const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function firstDefined(object, ...keys) {
  for (const key of keys) {
    if (object[key] !== undefined) return object[key];
  }
  return undefined;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readWindow(source, id) {
  const usedPercent = finiteNumber(firstDefined(source, 'usedPercent', 'used_percent'));
  const resetsAt = finiteNumber(firstDefined(source, 'resetsAt', 'resets_at'));
  const windowDurationMins = finiteNumber(
    firstDefined(source, 'windowDurationMins', 'window_duration_mins', 'windowMinutes', 'window_minutes'),
  );
  const sourceName = firstDefined(source, 'name', 'windowName', 'window_name');

  return {
    id,
    name: typeof sourceName === 'string' && sourceName.length > 0 ? sourceName : id,
    usedPercent,
    remainingPercent: usedPercent === null ? null : Math.min(100, Math.max(0, 100 - usedPercent)),
    resetsAt,
    windowDurationMins,
  };
}

function looksLikeWindow(value) {
  return isRecord(value) && [
    'usedPercent', 'used_percent', 'resetsAt', 'resets_at',
    'windowDurationMins', 'window_duration_mins', 'windowMinutes', 'window_minutes',
  ].some((key) => Object.hasOwn(value, key));
}

function readWindows(source) {
  const primary = firstDefined(source, 'primary', 'primaryWindow', 'primary_window');
  const secondary = firstDefined(source, 'secondary', 'secondaryWindow', 'secondary_window');
  const windows = [];

  if (isRecord(primary)) windows.push(readWindow(primary, 'primary'));
  if (isRecord(secondary)) windows.push(readWindow(secondary, 'secondary'));

  for (const [id, value] of Object.entries(source)) {
    if (['primary', 'primaryWindow', 'primary_window', 'secondary', 'secondaryWindow', 'secondary_window'].includes(id)) {
      continue;
    }
    if (looksLikeWindow(value)) windows.push(readWindow(value, id));
  }

  if (windows.length === 0 && looksLikeWindow(source)) windows.push(readWindow(source, 'primary'));
  return windows;
}

function bucketFromEntry(id, source) {
  if (!isRecord(source)) return null;
  const bucketId = String(id);
  const sourceName = firstDefined(source, 'name', 'limitName', 'limit_name');
  return {
    id: bucketId,
    name: typeof sourceName === 'string' && sourceName.length > 0 ? sourceName : bucketId,
    windows: readWindows(source),
  };
}

function bucketsFromMap(map) {
  if (!isRecord(map)) return [];

  const entries = Object.entries(map).filter(([, value]) => isRecord(value));
  if (entries.length === 0) return [];

  const isLegacyWindowMap = entries.some(([key]) => ['primary', 'primaryWindow', 'primary_window', 'secondary', 'secondaryWindow', 'secondary_window'].includes(key)) &&
    entries.every(([key]) => ['primary', 'primaryWindow', 'primary_window', 'secondary', 'secondaryWindow', 'secondary_window'].includes(key));

  if (isLegacyWindowMap) return [bucketFromEntry('legacy', map)];

  return entries
    .map(([id, value]) => bucketFromEntry(id, value))
    .filter((bucket) => bucket !== null);
}

export function normalizeQuota(payload, nowMs = Date.now()) {
  const source = isRecord(payload) ? payload : {};
  const modern = firstDefined(source, 'rateLimitsByLimitId', 'rate_limits_by_limit_id');
  const legacy = firstDefined(source, 'rateLimits', 'rate_limits');
  const modernBuckets = bucketsFromMap(modern);
  const buckets = modernBuckets.length > 0 ? modernBuckets : bucketsFromMap(legacy);

  return {
    buckets: buckets.filter((bucket) => bucket.windows.length > 0),
    updatedAt: finiteNumber(nowMs),
  };
}
