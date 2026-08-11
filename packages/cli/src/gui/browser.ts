import { spawn } from 'node:child_process';
import { platform } from 'node:os';

/** 跨平台打开默认浏览器。 */
export function openBrowser(url: string): void {
  const cmd = platform() === 'darwin' ? 'open'
    : platform() === 'win32' ? 'cmd'
    : 'xdg-open';
  const args = platform() === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {
    // 忽略打开失败
  }
}
