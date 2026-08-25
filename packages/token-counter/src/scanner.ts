import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { decompressZstd } from './zstd.js';

// node:sqlite 是内置模块，createRequire 仅用于加载它；路径用兜底值兼容 CJS 打包（import.meta.url 可能为 undefined）
const require = createRequire(import.meta.url || 'file:///noop.js');

export interface ScanTarget {
  path: string;
  source: string;
}

export async function findClaudeCodeLogs(): Promise<ScanTarget[]> {
  const base = join(homedir(), '.claude', 'projects');
  if (!existsSync(base)) return [];
  const targets: ScanTarget[] = [];
  const walk = async (dir: string) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // 忽略权限错误
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.name.endsWith('.jsonl')) {
        targets.push({ path: full, source: 'claude-code' });
      }
    }
  };
  await walk(base);
  return targets;
}

export async function findCodexLogs(): Promise<ScanTarget[]> {
  const candidates = [
    join(homedir(), '.codex', 'logs'),
    join(homedir(), '.config', 'codex', 'logs'),
  ];
  const targets: ScanTarget[] = [];
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.endsWith('.jsonl') || e.name.endsWith('.log')) {
          targets.push({ path: join(dir, e.name), source: 'codex' });
        }
      }
    } catch {
      // 忽略
    }
  }
  return targets;
}

export async function findCursorLogs(): Promise<ScanTarget[]> {
  const base = join(homedir(), 'Library', 'Application Support', 'Cursor', 'logs');
  if (!existsSync(base)) return [];
  const targets: ScanTarget[] = [];
  try {
    const entries = await readdir(base, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        const sub = join(base, e.name);
        try {
          const subEntries = await readdir(sub, { withFileTypes: true });
          for (const se of subEntries) {
            if (se.name.endsWith('.jsonl') || se.name.endsWith('.log')) {
              targets.push({ path: join(sub, se.name), source: 'cursor' });
            }
          }
        } catch {
          // 忽略
        }
      } else if (e.name.endsWith('.jsonl') || e.name.endsWith('.log')) {
        targets.push({ path: join(base, e.name), source: 'cursor' });
      }
    }
  } catch {
    // 忽略
  }
  return targets;
}

/** opencode 将 token 数据存在 SQLite（~/.local/share/opencode/opencode.db 的 message 表） */
export function findOpenCodeDb(): ScanTarget[] {
  const candidates = [
    join(homedir(), '.local', 'share', 'opencode', 'opencode.db'),
  ];
  const targets: ScanTarget[] = [];
  for (const p of candidates) {
    if (existsSync(p)) targets.push({ path: p, source: 'opencode' });
  }
  return targets;
}

/** deepseek-harness 会话日志根目录（~/.dsh/sessions/） */
export function harnessSessionsRoot(): string {
  return join(homedir(), '.dsh', 'sessions');
}

/**
 * deepseek-harness 将每个会话写成一个目录，内含多帧 zstd 压缩的 session.jsonl.zstd
 * （compression:'none' 时为 session.jsonl）。目录名形如 --<规范化cwd>--，保留可读项目路径。
 */
export async function findHarnessLogs(): Promise<ScanTarget[]> {
  const base = harnessSessionsRoot();
  if (!existsSync(base)) return [];
  const targets: ScanTarget[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // 忽略权限错误
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.name === 'session.jsonl.zstd' || e.name === 'session.jsonl') {
        targets.push({ path: full, source: 'deepseek-harness' });
      }
    }
  };
  await walk(base);
  return targets;
}

export async function discoverScanTargets(): Promise<ScanTarget[]> {
  const [claude, codex, cursor, opencode, harness] = await Promise.all([
    findClaudeCodeLogs(),
    findCodexLogs(),
    findCursorLogs(),
    Promise.resolve(findOpenCodeDb()),
    findHarnessLogs(),
  ]);
  return [...claude, ...codex, ...cursor, ...opencode, ...harness];
}

/** 读取扫描目标的内容行。opencode 从 SQLite 导出 assistant 消息为 JSON 行，harness 解压 zstd 帧，其余按文本文件读取。 */
export async function readTargetLines(target: ScanTarget): Promise<string[]> {
  if (target.source === 'opencode') {
    return readOpenCodeMessages(target.path);
  }
  if (target.source === 'deepseek-harness') {
    return readHarnessLines(target.path);
  }
  const content = await readFile(target.path, 'utf-8');
  return content.split('\n').filter((l) => l.trim().length > 0);
}

/** 读取 deepseek-harness 会话日志：zstd 文件多帧解压后按行返回，raw jsonl 直接读取。 */
export function readHarnessLines(path: string): string[] {
  try {
    if (path.endsWith('.jsonl.zstd')) {
      const buffer = readFileSync(path);
      const text = decompressZstd(buffer);
      if (text === null) throw new Error('zstd decompress failed');
      return text.split('\n').filter((l) => l.trim().length > 0);
    }
    const content = readFileSync(path, 'utf-8');
    return content.split('\n').filter((l) => l.trim().length > 0);
  } catch (err) {
    warnHarnessReadFailure(err);
    return [];
  }
}

let warnedHarnessRead = false;

/** deepseek-harness 读取失败时输出一次性警告，避免数据静默缺失。 */
function warnHarnessReadFailure(err: unknown): void {
  if (warnedHarnessRead) return;
  warnedHarnessRead = true;
  const msg = err instanceof Error ? err.message : String(err);
  const zstdHint = /zstd|decompress/i.test(msg)
    ? ' 当前 Node.js 版本缺少内置 zstd 支持（需 Node.js 22.22+），deepseek-harness token 统计将跳过。'
    : '';
  console.warn(`⚠ 无法读取 deepseek-harness 日志，deepseek-harness token 统计将跳过（${msg}）。${zstdHint}`);
}

/** 从 opencode SQLite 导出含 tokens 的 assistant 消息为 JSON 行（按 time_created, id 排序） */
export function readOpenCodeMessages(dbPath: string): string[] {
  try {
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (path: string, opts?: { readOnly?: boolean }) => {
        prepare(sql: string): { all(...args: unknown[]): Array<Record<string, unknown>> };
        close(): void;
      };
    };
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const stmt = db.prepare(
      'SELECT data FROM message WHERE data LIKE ? AND data LIKE ? ORDER BY time_created, id'
    );
    const rows = stmt.all('%"role":"assistant"%', '%"tokens"%');
    db.close();
    const lines: string[] = [];
    for (const row of rows) {
      if (typeof row.data === 'string') lines.push(row.data);
    }
    return lines;
  } catch (err) {
    warnOpenCodeReadFailure(err);
    return [];
  }
}

let warnedOpenCodeRead = false;

/** opencode 读取失败时输出一次性警告，避免数据静默缺失。 */
function warnOpenCodeReadFailure(err: unknown): void {
  if (warnedOpenCodeRead) return;
  warnedOpenCodeRead = true;
  const msg = err instanceof Error ? err.message : String(err);
  const versionHint = /experimental/i.test(msg)
    ? ' 当前 Node.js 版本需通过 --experimental-sqlite 启用 node:sqlite，或升级至 Node.js 22.13+。'
    : '';
  console.warn(`⚠ 无法读取 opencode 日志，opencode token 统计将跳过（${msg}）。${versionHint}`);
}
