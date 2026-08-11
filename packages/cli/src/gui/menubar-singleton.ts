import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { CONFIG_DIR, MENUBAR_PID_FILE } from './constants.js';
import { isProcessAlive } from './singleton.js';

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

/** 检查 menubar 是否已存活（PID 文件）。 */
export function isMenuBarRunning(): boolean {
  try {
    if (!existsSync(MENUBAR_PID_FILE)) return false;
    const pid = parseInt(readFileSync(MENUBAR_PID_FILE, 'utf-8').trim(), 10);
    return isProcessAlive(pid);
  } catch {
    return false;
  }
}

/** 写入 menubar PID 文件。 */
export function writeMenuBarPid(pid: number): void {
  ensureConfigDir();
  writeFileSync(MENUBAR_PID_FILE, String(pid), { mode: 0o600 });
}

/** 清理 menubar PID 文件。 */
export function clearMenuBarPid(): void {
  try { if (existsSync(MENUBAR_PID_FILE)) unlinkSync(MENUBAR_PID_FILE); } catch { /* ignore */ }
}
