import { spawn as nodeSpawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const POWERSHELL = 'powershell.exe';
const SCRIPT_PATH = fileURLToPath(new URL('../windows/play-cue.ps1', import.meta.url));
const PILOTS = new Set(['asuka', 'rei']);
const KINDS = new Set(['approval', 'completed']);
const activePlayers = new Set();

/** Plays one of the four fixed local notification cues. No URL or caller-supplied path is accepted. */
export async function playCue({ pilot, kind, volume = 0.7, spawn: spawnProcess = nodeSpawn, platform = process.platform } = {}) {
  if (!PILOTS.has(pilot) || !KINDS.has(kind)) return { ok: false, code: 'INVALID_CUE' };
  if (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > 1) {
    return { ok: false, code: 'INVALID_VOLUME' };
  }
  if (platform !== 'win32') return { ok: false, code: 'UNSUPPORTED_PLATFORM' };

  let child;
  try {
    child = spawnProcess(POWERSHELL, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA',
      '-File', SCRIPT_PATH, pilot, kind, String(volume),
    ], { stdio: 'ignore', windowsHide: true });
  } catch {
    return { ok: false, code: 'SOUND_UNAVAILABLE' };
  }

  activePlayers.add(child);
  child.on?.('exit', () => activePlayers.delete(child));
  child.on?.('error', () => activePlayers.delete(child));
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.once?.('spawn', () => finish({ ok: true }));
    child.once?.('error', () => finish({ ok: false, code: 'SOUND_UNAVAILABLE' }));
    if (typeof child.once !== 'function') finish({ ok: true });
  });
}

/** Stops every cue process started by this module and returns the number terminated. */
export async function stopSounds() {
  const players = [...activePlayers];
  activePlayers.clear();
  for (const child of players) {
    try { child.kill(); } catch { /* Process may already be gone. */ }
  }
  return players.length;
}
