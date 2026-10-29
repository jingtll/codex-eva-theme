import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { discoverCodexAsar } from './discovery.mjs';
import { openAsar } from './asar.mjs';

const MAX_PACKAGE_BYTES = 512 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const FUSE_SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX', 'ascii');

function findEntryPaths(files) {
  const earlyBootstrap = files.includes('.vite/build/early-bootstrap.js')
    ? '.vite/build/early-bootstrap.js'
    : null;
  const main = files.find((file) => /^\.vite\/build\/main(?:[-.][^/]+)?\.js$/i.test(file)) ?? null;
  const preload = files.find((file) => /^\.vite\/build\/preload(?:[-.][^/]+)?\.js$/i.test(file)) ?? null;
  const webview = files.includes('webview/index.html') ? 'webview/index.html' : null;
  return { earlyBootstrap, main, preload, webview };
}

async function readFuseEvidence(executablePath) {
  if (!executablePath) return { status: 'unavailable' };
  try {
    const binary = await readFile(join(dirname(executablePath), 'chrome.dll'));
    const position = binary.indexOf(FUSE_SENTINEL);
    if (position < 0 || position + FUSE_SENTINEL.length + 2 > binary.length) {
      return { status: 'sentinel_not_found' };
    }
    const version = binary[position + FUSE_SENTINEL.length];
    const length = binary[position + FUSE_SENTINEL.length + 1];
    const start = position + FUSE_SENTINEL.length + 2;
    const encoded = binary.subarray(start, start + length);
    if (version !== 1 || length < 6 || encoded.length !== length || !/^[01]+$/.test(encoded.toString('ascii'))) {
      return { status: 'format_unrecognized' };
    }
    const bits = encoded.toString('ascii');
    return {
      status: 'read',
      version,
      embeddedAsarIntegrityValidation: bits[4] === '1',
      onlyLoadAppFromAsar: bits[5] === '1',
      nodeOptions: bits[2] === '1',
      nodeCliInspect: bits[3] === '1',
      // Remaining fuse bits are intentionally not interpreted by this version.
      additionalFuseBitsPresent: bits.length > 4,
    };
  } catch {
    return { status: 'unavailable' };
  }
}

async function probeLocalEndpoint(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 'not_configured';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: controller.signal,
      redirect: 'manual',
    });
    if (!response.ok) return 'unavailable';
    const body = await response.json();
    return body && typeof body.Browser === 'string' ? 'responding' : 'unrecognized';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}

async function diagnose() {
  const discovered = await discoverCodexAsar();
  const report = {
    schemaVersion: 1,
    discovery: discovered.status,
    source: discovered.source ?? null,
    versions: {
      executable: discovered.fileVersion ?? null,
      package: null,
    },
    fingerprint: null,
    codeEntryEvidence: null,
    launchSwitchEvidence: {
      remoteDebuggingPort: discovered.remoteDebuggingSwitchPresent === true
        ? 'present'
        : discovered.remoteDebuggingSwitchPresent === false
          ? 'not_detected'
          : 'not_observed',
      remoteDebuggingPipe: discovered.remoteDebuggingPipePresent === true
        ? 'present'
        : discovered.remoteDebuggingPipePresent === false
          ? 'not_detected'
          : 'not_observed',
    },
    endpoint: {
      localDebugging: 'not_configured',
    },
    electronFuses: await readFuseEvidence(discovered.executablePath),
    conclusion: '未执行连接、注入、启动或关闭操作。',
  };

  if (discovered.status !== 'found') {
    if (discovered.status === 'process_not_found') {
      report.conclusion = '未发现正在运行的 ChatGPT.exe；可通过 --asar 指定归档继续静态检查。';
    } else if (discovered.status === 'ambiguous') {
      report.conclusion = '活动进程对应多个归档候选，未自动选择。';
    } else {
      report.conclusion = '当前未能唯一发现可检查的 ASAR 归档。';
    }
    return report;
  }

  report.endpoint.localDebugging = discovered.remoteDebuggingSwitchPresent === true
    ? discovered.remoteDebuggingPort === 0
      ? 'dynamic_port_not_checked'
      : discovered.remoteDebuggingPort === null
        ? 'port_not_resolved'
        : await probeLocalEndpoint(discovered.remoteDebuggingPort)
    : discovered.remoteDebuggingSwitchPresent === false
      ? 'no_startup_switch_detected'
      : 'not_observed';

  const archive = await openAsar(discovered.asarPath);
  try {
    const files = archive.list();
    const entries = findEntryPaths(files);
    const hashes = [];
    for (const archivePath of Object.values(entries).filter(Boolean)) {
      try {
        const content = await archive.readText(archivePath, MAX_ENTRY_BYTES);
        const digest = createHash('sha256').update(content, 'utf8').digest('hex');
        hashes.push(`${archivePath}\0${digest}`);
      } catch {
        hashes.push(`${archivePath}\0unreadable`);
      }
    }

    try {
      const packageText = await archive.readText('package.json', MAX_PACKAGE_BYTES);
      const packageJson = JSON.parse(packageText);
      report.versions.package = typeof packageJson.version === 'string' ? packageJson.version : null;
    } catch {
      report.versions.package = null;
    }

    report.fingerprint = hashes.length > 0
      ? { algorithm: 'sha256', value: createHash('sha256').update(hashes.sort().join('\n')).digest('hex') }
      : null;
    report.codeEntryEvidence = {
      earlyBootstrap: entries.earlyBootstrap !== null,
      mainBundle: entries.main !== null,
      preload: entries.preload !== null,
      webview: entries.webview !== null,
      paths: Object.values(entries).filter(Boolean).sort(),
    };
  } finally {
    await archive.close();
  }

  if (report.endpoint.localDebugging === 'no_startup_switch_detected') {
    report.conclusion = '静态确认 ASAR 入口；当前普通启动未检测到调试端口开关，尚未证明其他接入方式不可行。';
  } else {
    report.conclusion = '已完成 ASAR 只读指纹与代码入口检查；端点状态不代表页面注入或事件订阅验收。';
  }
  return report;
}

const report = await diagnose().catch((error) => ({
  schemaVersion: 1,
  discovery: 'diagnostic_error',
  errorCode: typeof error?.code === 'string' ? error.code : 'DIAGNOSTIC_FAILED',
  conclusion: '诊断中止；未执行连接、注入、启动或关闭操作。',
}));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
