import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { getAllKeys, getKey, setKey, unsetKey } from '@deepseek-plugins/shared';
import { fetchBalance } from '@deepseek-plugins/shared/balance';
import {
  scanAndAggregate,
  getSummary,
  getBuckets,
  generateDailyReport,
  type TokenSummary,
  type TokenBucket,
  type DailyReport,
} from '@deepseek-plugins/token-counter';
import guiHtml from './index.html';

const CONFIG_DIR = join(homedir(), '.deepseek-plugins');
export const PID_FILE = join(CONFIG_DIR, 'service.pid');
export const PORT_FILE = join(CONFIG_DIR, 'service.port');
const MENUBAR_PID_FILE = join(CONFIG_DIR, 'menubar.pid');
const DEEPSEEK_SERVICE = 'deepseek';
const VISION_PREFIX = 'vision';

interface ModelEntry {
  role: 'primary' | 'fallback';
  index: number;
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface ConfigResponse {
  deepseekKeySet: boolean;
  models: ModelEntry[];
}

// ─── 凭据读写（与原 gui/server.ts 一致） ───

function readModels(all: Record<string, string>): ModelEntry[] {
  const models: ModelEntry[] = [];
  const pBase = all[`${VISION_PREFIX}.base_url`] ?? '';
  const pModel = all[`${VISION_PREFIX}.model`] ?? '';
  const pKey = all[VISION_PREFIX] ?? '';
  if (pBase || pModel || pKey) {
    models.push({ role: 'primary', index: -1, baseUrl: pBase, model: pModel, apiKey: pKey });
  }
  for (let i = 0; ; i++) {
    const prefix = `${VISION_PREFIX}.fallback.${i}`;
    const baseUrl = all[`${prefix}.base_url`] ?? '';
    const model = all[`${prefix}.model`] ?? '';
    const apiKey = all[prefix] ?? '';
    if (!baseUrl && !model && !apiKey) break;
    models.push({ role: 'fallback', index: i, baseUrl, model, apiKey });
  }
  return models;
}

async function writePrimary(patch: { baseUrl?: string; model?: string; apiKey?: string }): Promise<void> {
  if (patch.baseUrl !== undefined) await setKey(`${VISION_PREFIX}.base_url`, patch.baseUrl);
  if (patch.model !== undefined) await setKey(`${VISION_PREFIX}.model`, patch.model);
  if (patch.apiKey) await setKey(VISION_PREFIX, patch.apiKey);
}

async function writeFallback(index: number, patch: { baseUrl?: string; model?: string; apiKey?: string }): Promise<void> {
  const prefix = `${VISION_PREFIX}.fallback.${index}`;
  if (patch.baseUrl !== undefined) await setKey(`${prefix}.base_url`, patch.baseUrl);
  if (patch.model !== undefined) await setKey(`${prefix}.model`, patch.model);
  if (patch.apiKey) await setKey(prefix, patch.apiKey);
}

async function appendFallback(entry: { baseUrl: string; model: string; apiKey: string }): Promise<number> {
  const all = await getAllKeys();
  let idx = 0;
  while (all[`${VISION_PREFIX}.fallback.${idx}.base_url`] || all[`${VISION_PREFIX}.fallback.${idx}.model`] || all[`${VISION_PREFIX}.fallback.${idx}`]) {
    idx++;
  }
  const prefix = `${VISION_PREFIX}.fallback.${idx}`;
  await setKey(`${prefix}.base_url`, entry.baseUrl);
  await setKey(`${prefix}.model`, entry.model);
  await setKey(prefix, entry.apiKey);
  return idx;
}

async function deleteModel(pos: number): Promise<boolean> {
  const all = await getAllKeys();
  const models = readModels(all);
  if (pos < 0 || pos >= models.length) return false;
  const target = models[pos];
  if (!target) return false;

  if (target.role === 'primary') {
    await unsetKey(VISION_PREFIX);
    await unsetKey(`${VISION_PREFIX}.base_url`);
    await unsetKey(`${VISION_PREFIX}.model`);
    return true;
  }

  const idx = target.index;
  const prefix = `${VISION_PREFIX}.fallback.${idx}`;
  await unsetKey(prefix);
  await unsetKey(`${prefix}.base_url`);
  await unsetKey(`${prefix}.model`);

  for (let i = idx + 1; ; i++) {
    const src = `${VISION_PREFIX}.fallback.${i}`;
    const has = all[`${src}.base_url`] || all[`${src}.model`] || all[src];
    if (!has) break;
    const dst = `${VISION_PREFIX}.fallback.${i - 1}`;
    const k = all[src];
    const u = all[`${src}.base_url`];
    const m = all[`${src}.model`];
    if (k) await setKey(dst, k);
    if (u) await setKey(`${dst}.base_url`, u);
    if (m) await setKey(`${dst}.model`, m);
    await unsetKey(src);
    await unsetKey(`${src}.base_url`);
    await unsetKey(`${src}.model`);
  }
  return true;
}

async function moveModel(pos: number, dir: number): Promise<boolean> {
  const all = await getAllKeys();
  const models = readModels(all);
  if (pos <= 0 || pos >= models.length) return false;
  const other = pos + dir;
  if (other <= 0 || other >= models.length) return false;
  const a = models[pos];
  const b = models[other];
  if (!a || !b || a.role !== 'fallback' || b.role !== 'fallback') return false;

  const aPrefix = `${VISION_PREFIX}.fallback.${a.index}`;
  const bPrefix = `${VISION_PREFIX}.fallback.${b.index}`;
  const swap = async (suffix: string) => {
    const av = all[`${aPrefix}${suffix}`] ?? '';
    const bv = all[`${bPrefix}${suffix}`] ?? '';
    if (bv) await setKey(`${aPrefix}${suffix}`, bv); else await unsetKey(`${aPrefix}${suffix}`);
    if (av) await setKey(`${bPrefix}${suffix}`, av); else await unsetKey(`${bPrefix}${suffix}`);
  };
  await swap('');
  await swap('.base_url');
  await swap('.model');
  return true;
}

// ─── HTTP 响应工具 ───

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function sendHtml(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(guiHtml),
  });
  res.end(guiHtml);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ─── 后台服务：启动 HTTP 服务器（常驻，不退出） ───

/** 启动共享后台服务，监听 127.0.0.1，返回实际端口。 */
export function startService(): Promise<number> {
  const server = createServer(async (req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    const host = req.headers.host ?? '';
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
      sendJson(res, 403, { error: '仅允许本机访问' });
      return;
    }

    try {
      // 健康检查（供单例探测使用）
      if (method === 'GET' && url === '/health') {
        sendJson(res, 200, { ok: true, pid: process.pid });
        return;
      }

      // GUI 页面
      if (method === 'GET' && (url === '/' || url === '/index.html')) {
        sendHtml(res);
        return;
      }

      // 读取全部配置
      if (method === 'GET' && url === '/api/config') {
        const all = await getAllKeys();
        const resp: ConfigResponse = {
          deepseekKeySet: !!all[DEEPSEEK_SERVICE],
          models: readModels(all),
        };
        sendJson(res, 200, resp);
        return;
      }

      // 读取 DeepSeek API Key（明文，仅本机访问）
      if (method === 'GET' && url === '/api/deepseek-key') {
        const apiKey = await getKey(DEEPSEEK_SERVICE);
        sendJson(res, 200, { apiKey: apiKey ?? '' });
        return;
      }

      // 设置 DeepSeek API Key
      if (method === 'PUT' && url === '/api/deepseek-key') {
        const body = (await readBody(req)) as { apiKey?: string };
        if (!body.apiKey || !body.apiKey.trim()) {
          sendJson(res, 400, { error: 'apiKey 不能为空' });
          return;
        }
        await setKey(DEEPSEEK_SERVICE, body.apiKey.trim());
        sendJson(res, 200, { ok: true });
        return;
      }

      // 新增备选模型
      if (method === 'POST' && url === '/api/models') {
        const body = (await readBody(req)) as { role?: string; baseUrl?: string; model?: string; apiKey?: string };
        if (body.role !== 'fallback') {
          sendJson(res, 400, { error: '仅支持添加备选模型（role=fallback）' });
          return;
        }
        if (!body.baseUrl?.trim() || !body.model?.trim() || !body.apiKey?.trim()) {
          sendJson(res, 400, { error: 'base_url / model / apiKey 均为必填' });
          return;
        }
        const idx = await appendFallback({
          baseUrl: body.baseUrl.trim(),
          model: body.model.trim(),
          apiKey: body.apiKey.trim(),
        });
        sendJson(res, 200, { ok: true, index: idx });
        return;
      }

      // 更新指定位置模型
      const putMatch = url.match(/^\/api\/models\/(\d+)$/);
      if (method === 'PUT' && putMatch) {
        const pos = parseInt(putMatch[1]!, 10);
        const all = await getAllKeys();
        const models = readModels(all);
        if (pos < 0 || pos >= models.length) {
          sendJson(res, 404, { error: '模型不存在' });
          return;
        }
        const body = (await readBody(req)) as { baseUrl?: string; model?: string; apiKey?: string };
        const target = models[pos]!;
        const patch: { baseUrl?: string; model?: string; apiKey?: string } = {};
        if (body.baseUrl !== undefined) patch.baseUrl = body.baseUrl.trim();
        if (body.model !== undefined) patch.model = body.model.trim();
        if (body.apiKey !== undefined && body.apiKey !== '') patch.apiKey = body.apiKey.trim();
        if (target.role === 'primary') await writePrimary(patch);
        else await writeFallback(target.index, patch);
        sendJson(res, 200, { ok: true });
        return;
      }

      // 删除指定位置模型
      const delMatch = url.match(/^\/api\/models\/(\d+)$/);
      if (method === 'DELETE' && delMatch) {
        const pos = parseInt(delMatch[1]!, 10);
        const ok = await deleteModel(pos);
        if (!ok) { sendJson(res, 404, { error: '模型不存在' }); return; }
        sendJson(res, 200, { ok: true });
        return;
      }

      // 移动备选模型
      const moveMatch = url.match(/^\/api\/models\/(\d+)\/move$/);
      if (method === 'POST' && moveMatch) {
        const pos = parseInt(moveMatch[1]!, 10);
        const body = (await readBody(req)) as { dir?: number };
        const dir = body.dir === -1 ? -1 : 1;
        const ok = await moveModel(pos, dir);
        if (!ok) { sendJson(res, 400, { error: '无法移动到该位置' }); return; }
        sendJson(res, 200, { ok: true });
        return;
      }

      // ─── Token 端点 ───

      // 扫描 + 汇总
      if (method === 'GET' && url === '/api/token/summary') {
        scanAndAggregate();
        const summary: TokenSummary = getSummary();
        sendJson(res, 200, summary);
        return;
      }

      // 最近桶数据
      if (method === 'GET' && url.startsWith('/api/token/buckets')) {
        const u = new URL(url, 'http://localhost');
        const limit = parseInt(u.searchParams.get('limit') ?? '100', 10) || 100;
        const buckets: TokenBucket[] = getBuckets().slice(-limit).reverse();
        sendJson(res, 200, { buckets });
        return;
      }

      // 按日报告
      if (method === 'GET' && url.startsWith('/api/token/report')) {
        const u = new URL(url, 'http://localhost');
        const days = parseInt(u.searchParams.get('days') ?? '7', 10) || 7;
        const report: DailyReport[] = generateDailyReport(days);
        sendJson(res, 200, { report });
        return;
      }

      // 触发扫描
      if (method === 'POST' && url === '/api/token/scan') {
        const result = scanAndAggregate();
        sendJson(res, 200, result);
        return;
      }

      // ─── 余额端点 ───

      if (method === 'GET' && url === '/api/balance') {
        const { result, error } = await fetchBalance();
        if (error) sendJson(res, 200, { result: null, error });
        else sendJson(res, 200, { result, error: null });
        return;
      }

      sendJson(res, 404, { error: 'Not Found' });
    } catch (e) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    // 端口 0 = 随机可用端口；若指定端口被占用，Node 会自动报错，由调用方处理
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve(port);
    });
  });
}

// ─── 单例管理：PID / port 文件 ───

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

// ─── menubar 单例管理 ───

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

// ─── 浏览器打开 ───

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
