import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const execFile = promisify(execFileCallback);
const winPath = path.win32;

function parseAsarArgument(argv) {
  const matches = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--asar') {
      if (typeof argv[index + 1] !== 'string' || argv[index + 1].startsWith('--')) {
        return { invalid: true };
      }
      matches.push(argv[index + 1]);
      index += 1;
    } else if (typeof arg === 'string' && arg.startsWith('--asar=')) {
      matches.push(arg.slice('--asar='.length));
    }
  }
  if (matches.length > 1 || matches.some((value) => !value || value.trim().length === 0)) {
    return { invalid: true };
  }
  return { value: matches[0] ?? null };
}

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function readRunningCodexProcesses() {
  // Only derived fields leave PowerShell. The full process command line is never returned.
  const script = String.raw`
$items = @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
  $fileVersion = $null
  try { $fileVersion = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($_.ExecutablePath).FileVersion } catch {}
  $debugPort = $null
  $debugSwitch = $false
  $debugPipe = $false
  $commandLine = [string]$_.CommandLine
  if ($commandLine -match '(?i)(?:^|\s)--remote-debugging-port(?:=|\s+)(?<port>\d{1,5})(?:\s|$)') {
    $debugSwitch = $true
    $debugPort = [int]$Matches['port']
  }
  if ($commandLine -match '(?i)(?:^|\s)--remote-debugging-pipe(?:\s|$)') { $debugPipe = $true }
  [PSCustomObject]@{
    executablePath = $_.ExecutablePath
    fileVersion = $fileVersion
    remoteDebuggingSwitchPresent = $debugSwitch
    remoteDebuggingPort = $debugPort
    remoteDebuggingPipePresent = $debugPipe
  }
})
ConvertTo-Json -InputObject $items -Compress -Depth 3
`;
  const result = await execFile('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script,
  ], { timeout: 5000, maxBuffer: 1024 * 1024, windowsHide: true });
  const output = result.stdout.trim();
  if (!output) return [];
  const parsed = JSON.parse(output);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.filter((item) => item && typeof item.executablePath === 'string').map((item) => ({
    executablePath: item.executablePath,
    fileVersion: typeof item.fileVersion === 'string' ? item.fileVersion : null,
    remoteDebuggingSwitchPresent: item.remoteDebuggingSwitchPresent === true,
    remoteDebuggingPort: Number.isInteger(item.remoteDebuggingPort) ? item.remoteDebuggingPort : null,
    remoteDebuggingPipePresent: item.remoteDebuggingPipePresent === true,
  }));
}

function archiveCandidates(executablePath) {
  const directory = winPath.dirname(executablePath);
  return [
    winPath.join(directory, 'resources', 'app.asar'),
    winPath.join(directory, 'app.asar'),
    winPath.resolve(directory, '..', 'resources', 'app.asar'),
  ];
}

/**
 * Finds an explicitly supplied ASAR or the archive next to a running ChatGPT.exe.
 * This discovery does not start, stop, or modify the client.
 */
export async function discoverCodexAsar({
  argv = process.argv.slice(2),
  platform = process.platform,
  processProvider = readRunningCodexProcesses,
  exists = fileExists,
} = {}) {
  const argument = parseAsarArgument(argv);
  if (argument.invalid) return { status: 'invalid_argument' };
  if (argument.value) {
    if (!(await exists(argument.value))) return { status: 'not_found', source: 'argument' };
    return { status: 'found', source: 'argument', asarPath: path.resolve(argument.value) };
  }
  if (platform !== 'win32') return { status: 'platform_unsupported' };

  let processes;
  try {
    processes = await processProvider();
  } catch {
    return { status: 'process_query_unavailable' };
  }
  const active = (Array.isArray(processes) ? processes : [])
    .filter((item) => item && typeof item.executablePath === 'string' &&
      winPath.basename(item.executablePath).toLowerCase() === 'chatgpt.exe');
  if (active.length === 0) return { status: 'process_not_found' };

  const candidates = new Map();
  for (const process of active) {
    for (const candidatePath of archiveCandidates(process.executablePath)) {
      if (!(await exists(candidatePath))) continue;
      const key = winPath.normalize(candidatePath).toLowerCase();
      if (!candidates.has(key)) candidates.set(key, {asarPath: candidatePath, processes: []});
      candidates.get(key).processes.push(process);
    }
  }
  if (candidates.size === 0) return { status: 'asar_not_found', processCount: active.length };
  if (candidates.size > 1) return { status: 'ambiguous', candidateCount: candidates.size };

  const candidate = [...candidates.values()][0];
  const versions = [...new Set(candidate.processes.map((item) => item.fileVersion).filter(Boolean))];
  const debugStates = [...new Set(candidate.processes.map((item) => item.remoteDebuggingSwitchPresent))];
  const ports = [...new Set(candidate.processes.map((item) => item.remoteDebuggingPort)
    .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535))];
  const pipeStates = [...new Set(candidate.processes.map((item) => item.remoteDebuggingPipePresent))];
  return {
    status: 'found',
    source: 'process',
    asarPath: candidate.asarPath,
    executablePath: candidate.processes[0]?.executablePath ?? null,
    fileVersion: versions.length === 1 ? versions[0] : null,
    remoteDebuggingSwitchPresent: debugStates.length === 1 ? debugStates[0] : null,
    remoteDebuggingPort: ports.length === 1 ? ports[0] : null,
    remoteDebuggingPipePresent: pipeStates.length === 1 ? pipeStates[0] : null,
    processCount: candidate.processes.length,
  };
}

function mainPagePath(expectedUrl) {
  return expectedUrl.pathname && expectedUrl.pathname !== '/'
    ? expectedUrl.pathname
    : '/index.html';
}

/** Returns true only for the configured Codex renderer's main page target. */
export function isCodexTarget(target, expectedOrigin) {
  if (!target || target.type !== 'page' || typeof target.url !== 'string' ||
      typeof expectedOrigin !== 'string') return false;
  try {
    const actual = new URL(target.url);
    const expected = new URL(expectedOrigin);
    if (actual.username || actual.password || expected.username || expected.password) return false;
    return actual.protocol === expected.protocol &&
      actual.host === expected.host &&
      actual.pathname === mainPagePath(expected);
  } catch {
    return false;
  }
}
