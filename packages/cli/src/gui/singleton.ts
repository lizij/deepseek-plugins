import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { CONFIG_DIR, PID_FILE, PORT_FILE } from './constants.js';
import { startService } from './server.js';

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

/** 检查指定 PID 的进程是否存活。 */
export function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 读取 port 文件，返回端口号；文件不存在或无效返回 null。 */
function readPortFile(): number | null {
  try {
    const port = parseInt(readFileSync(PORT_FILE, 'utf-8').trim(), 10);
    return isNaN(port) ? null : port;
  } catch {
    return null;
  }
}

/** 探测指定端口的后台服务是否存活（HTTP /health）。 */
async function probeService(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/** 清理失效的 PID/port 文件。 */
function cleanupStaleFiles(): void {
  try {
    if (existsSync(PID_FILE)) {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
      if (!isProcessAlive(pid)) {
        unlinkSync(PID_FILE);
        if (existsSync(PORT_FILE)) unlinkSync(PORT_FILE);
      }
    }
  } catch { /* ignore */ }
}

/** 确保后台服务存活，返回其 URL。若已存活则直接复用，否则以 detached 方式启动新进程。 */
export async function ensureServiceRunning(cliPath: string): Promise<{ url: string; port: number; started: boolean }> {
  ensureConfigDir();
  cleanupStaleFiles();

  // 1. 已有 port 文件 → 探测是否存活
  const existingPort = readPortFile();
  if (existingPort && await probeService(existingPort)) {
    return { url: `http://127.0.0.1:${existingPort}`, port: existingPort, started: false };
  }

  // 2. 启动新的 detached 后台服务进程
  const child = spawn(cliPath, ['__daemon'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // 3. 轮询等待服务就绪（最多 10 秒）
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const port = readPortFile();
    if (port && await probeService(port)) {
      return { url: `http://127.0.0.1:${port}`, port, started: true };
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  throw new Error('后台服务启动超时，请检查日志或手动运行 deepseek-plugin-cli gui');
}

/** 由 `__daemon` 入口调用：启动服务并写入 PID/port 文件，常驻不退出。 */
export async function runAsDaemon(): Promise<void> {
  ensureConfigDir();
  cleanupStaleFiles();

  const port = await startService();
  writeFileSync(PID_FILE, String(process.pid), { mode: 0o600 });
  writeFileSync(PORT_FILE, String(port), { mode: 0o600 });

  // 进程退出时清理 PID/port 文件
  const cleanup = () => {
    try { if (existsSync(PID_FILE)) unlinkSync(PID_FILE); } catch { /* ignore */ }
    try { if (existsSync(PORT_FILE)) unlinkSync(PORT_FILE); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);

  // 保持进程常驻
  await new Promise(() => { /* never resolve */ });
}
