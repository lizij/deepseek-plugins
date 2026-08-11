import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

// node:sqlite 是内置模块，createRequire 仅用于加载它；路径用兜底值兼容 CJS 打包（import.meta.url 可能为 undefined）
const require = createRequire(import.meta.url || 'file:///noop.js');

const DATA_DIR = join(homedir(), '.deepseek-plugins');
const BUCKET_FILE = join(DATA_DIR, 'token-buckets.json');
const SCAN_META_FILE = join(DATA_DIR, 'token-scan-meta.json');

const BUCKET_MS = 30 * 60 * 1000;

/** 桶数据保留天数：超过该时间的桶在扫描保存时裁剪，防止文件无限膨胀 */
export const BUCKET_RETENTION_DAYS = 90;
const RETENTION_MS = BUCKET_RETENTION_DAYS * 24 * 60 * 60 * 1000;

// ─── 类型定义 ───

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  reasoning_output_tokens: number;
}

export interface TokenEntry {
  timestamp: string;
  source: string;
  model: string;
  project: string;
  usage: TokenUsage;
}

export interface TokenBucket {
  bucket_start: string;
  source: string;
  model: string;
  project: string;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
  rounds: number;
}

export interface TokenBreakdownItem {
  name: string;
  tokens: number;
}

export interface TokenSummary {
  today: number;
  today_input: number;
  today_output: number;
  today_cached: number;
  today_cache_creation: number;
  today_reasoning: number;
  seven_day: number;
  all_time: number;
  updated_at: string;
  by_source: TokenBreakdownItem[];
  by_model: TokenBreakdownItem[];
}

export interface DailyReport {
  date: string;
  rounds: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
}

interface ScanMeta {
  files: Record<string, { mtime: number; size: number; last_line: number; last_hash: string }>;
  last_scan: string;
}

// ─── 工具函数 ───

export function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

function floorToBucket(ts: number): number {
  return Math.floor(ts / BUCKET_MS) * BUCKET_MS;
}

/** 解析时间戳；无效（含缺失/非法）返回 null */
function safeParseTime(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const ts = new Date(value as string).getTime();
  return isNaN(ts) ? null : ts;
}

function bucketKey(bucketStart: number, source: string, model: string, project: string): string {
  return `${bucketStart}|${source}|${model}|${project}`;
}

function hashLine(line: string): string {
  return createHash('sha256').update(line).digest('hex');
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ─── 存储：桶数据 ───

function loadBuckets(): TokenBucket[] {
  if (!existsSync(BUCKET_FILE)) return [];
  try {
    const raw = readFileSync(BUCKET_FILE, 'utf-8');
    if (!raw.trim()) return [];
    return JSON.parse(raw) as TokenBucket[];
  } catch {
    return [];
  }
}

function saveBuckets(buckets: TokenBucket[]): void {
  ensureDataDir();
  writeFileSync(BUCKET_FILE, JSON.stringify(buckets), 'utf-8');
}

function loadScanMeta(): ScanMeta {
  if (!existsSync(SCAN_META_FILE)) return { files: {}, last_scan: '' };
  try {
    return JSON.parse(readFileSync(SCAN_META_FILE, 'utf-8')) as ScanMeta;
  } catch {
    return { files: {}, last_scan: '' };
  }
}

function saveScanMeta(meta: ScanMeta): void {
  ensureDataDir();
  writeFileSync(SCAN_META_FILE, JSON.stringify(meta), 'utf-8');
}

// ─── 扫描器：发现 agent 日志文件 ───

interface ScanTarget {
  path: string;
  source: string;
}

function findClaudeCodeLogs(): ScanTarget[] {
  const base = join(homedir(), '.claude', 'projects');
  if (!existsSync(base)) return [];
  const targets: ScanTarget[] = [];
  const walk = (dir: string) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.name.endsWith('.jsonl')) {
        targets.push({ path: full, source: 'claude-code' });
      }
    }
  };
  try {
    walk(base);
  } catch {
    // 忽略权限错误
  }
  return targets;
}

function findCodexLogs(): ScanTarget[] {
  const candidates = [
    join(homedir(), '.codex', 'logs'),
    join(homedir(), '.config', 'codex', 'logs'),
  ];
  const targets: ScanTarget[] = [];
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
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

function findCursorLogs(): ScanTarget[] {
  const base = join(homedir(), 'Library', 'Application Support', 'Cursor', 'logs');
  if (!existsSync(base)) return [];
  const targets: ScanTarget[] = [];
  try {
    const entries = readdirSync(base, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        const sub = join(base, e.name);
        try {
          const subEntries = readdirSync(sub, { withFileTypes: true });
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

function discoverScanTargets(): ScanTarget[] {
  return [...findClaudeCodeLogs(), ...findCodexLogs(), ...findCursorLogs(), ...findOpenCodeDb()];
}

/** opencode 将 token 数据存在 SQLite（~/.local/share/opencode/opencode.db 的 message 表） */
function findOpenCodeDb(): ScanTarget[] {
  const candidates = [
    join(homedir(), '.local', 'share', 'opencode', 'opencode.db'),
  ];
  const targets: ScanTarget[] = [];
  for (const p of candidates) {
    if (existsSync(p)) targets.push({ path: p, source: 'opencode' });
  }
  return targets;
}

/** 读取扫描目标的内容行。opencode 从 SQLite 导出 assistant 消息为 JSON 行，其余按文本文件读取。 */
function readTargetLines(target: ScanTarget): string[] {
  if (target.source === 'opencode') {
    return readOpenCodeMessages(target.path);
  }
  const content = readFileSync(target.path, 'utf-8');
  return content.split('\n').filter((l) => l.trim().length > 0);
}

/** 从 opencode SQLite 导出含 tokens 的 assistant 消息为 JSON 行（按 time_created, id 排序） */
function readOpenCodeMessages(dbPath: string): string[] {
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
  } catch {
    return [];
  }
}

// ─── 项目名提取 ───

/**
 * 解析 agent 日志对应的项目名。
 * claude-code 优先从日志行内嵌的 cwd 取 basename（连字符编码无法还原真实项目名），
 * 找不到时回退到路径连字符编码启发式。
 */
function extractProject(source: string, filePath: string, lines: string[]): string {
  if (source === 'claude-code') {
    for (const line of lines) {
      const m = line.match(/"cwd"\s*:\s*"([^"]+)"/);
      if (m && m[1]) {
        const base = m[1].split('/').filter(Boolean).pop();
        if (base) return base;
      }
    }
    // 回退：~/.claude/projects/<encoded>/<session>.jsonl
    const parts = filePath.split('/');
    const idx = parts.lastIndexOf('projects');
    if (idx >= 0 && idx + 1 < parts.length) {
      const encoded = parts[idx + 1] ?? '';
      const decoded = encoded.replace(/^-/, '').split('-').filter(Boolean);
      return decoded[decoded.length - 1] || 'unknown';
    }
  }
  if (source === 'opencode') {
    for (const line of lines) {
      const m = line.match(/"cwd"\s*:\s*"([^"]+)"/);
      if (m && m[1]) {
        const base = m[1].split('/').filter(Boolean).pop();
        if (base) return base;
      }
    }
  }
  return 'unknown';
}

// ─── 解析器：从日志行提取 token 数据 ───

function parseClaudeCodeLine(line: string): TokenEntry | null {
  try {
    const obj = JSON.parse(line);
    if (obj.type !== 'assistant') return null;
    const msg = obj.message;
    if (!msg || !msg.usage) return null;
    const usage = msg.usage;
    const ts = safeParseTime(obj.timestamp);
    if (ts === null) return null;
    return {
      timestamp: new Date(ts).toISOString(),
      source: 'claude-code',
      model: msg.model || 'unknown',
      project: 'unknown',
      usage: {
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        cached_input_tokens: usage.cache_read_input_tokens || 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
        reasoning_output_tokens: usage.reasoning_output_tokens || 0,
      },
    };
  } catch {
    return null;
  }
}

function parseCodexLine(line: string): TokenEntry | null {
  try {
    const obj = JSON.parse(line);
    const usage = obj.usage || obj.token_usage;
    if (!usage) return null;
    const time = safeParseTime(obj.timestamp || obj.created_at || obj.time);
    if (time === null) return null;
    return {
      timestamp: new Date(time).toISOString(),
      source: 'codex',
      model: obj.model || 'unknown',
      project: 'unknown',
      usage: {
        input_tokens: usage.input_tokens || usage.prompt_tokens || 0,
        output_tokens: usage.output_tokens || usage.completion_tokens || 0,
        cached_input_tokens: usage.cache_read_input_tokens || 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
        reasoning_output_tokens: usage.reasoning_output_tokens || 0,
      },
    };
  } catch {
    return null;
  }
}

function parseCursorLine(line: string): TokenEntry | null {
  try {
    const obj = JSON.parse(line);
    const usage = obj.usage;
    if (!usage) return null;
    const time = safeParseTime(obj.timestamp || obj.time);
    if (time === null) return null;
    return {
      timestamp: new Date(time).toISOString(),
      source: 'cursor',
      model: obj.model || 'unknown',
      project: 'unknown',
      usage: {
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        cached_input_tokens: usage.cache_read_input_tokens || 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
        reasoning_output_tokens: usage.reasoning_output_tokens || 0,
      },
    };
  } catch {
    return null;
  }
}

function parseLine(line: string, source: string): TokenEntry | null {
  switch (source) {
    case 'claude-code':
      return parseClaudeCodeLine(line);
    case 'codex':
      return parseCodexLine(line);
    case 'cursor':
      return parseCursorLine(line);
    case 'opencode':
      return parseOpenCodeLine(line);
    default:
      return null;
  }
}

/** opencode assistant 消息：tokens 字段含 input/output/reasoning/cache.read/cache.write */
function parseOpenCodeLine(line: string): TokenEntry | null {
  try {
    const obj = JSON.parse(line);
    if (obj.role !== 'assistant') return null;
    const tokens = obj.tokens;
    if (!tokens) return null;
    const ts = safeParseTime(obj.time?.created);
    if (ts === null) return null;
    const model = [obj.providerID, obj.modelID].filter(Boolean).join('/') || 'unknown';
    return {
      timestamp: new Date(ts).toISOString(),
      source: 'opencode',
      model,
      project: 'unknown',
      usage: {
        input_tokens: tokens.input || 0,
        output_tokens: tokens.output || 0,
        cached_input_tokens: tokens.cache?.read || 0,
        cache_creation_input_tokens: tokens.cache?.write || 0,
        reasoning_output_tokens: tokens.reasoning || 0,
      },
    };
  } catch {
    return null;
  }
}

// ─── 扫描 + 聚合 ───

export interface ScanResult {
  scanned: number;
  new_entries: number;
  total_buckets: number;
  sources: string[];
}

/** 扫描所有 agent 日志，增量解析并聚合到桶 */
export function scanAndAggregate(): ScanResult {
  ensureDataDir();
  const targets = discoverScanTargets();
  const meta = loadScanMeta();
  const buckets = loadBuckets();
  const bucketMap = new Map<string, TokenBucket>();
  for (const b of buckets) {
    bucketMap.set(bucketKey(new Date(b.bucket_start).getTime(), b.source, b.model, b.project), b);
  }

  let newEntries = 0;
  const sources = new Set<string>();

  for (const target of targets) {
    sources.add(target.source);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(target.path);
    } catch {
      continue;
    }

    const cached = meta.files[target.path];
    // opencode 使用 WAL 模式，主 .db 文件 mtime/size 不随新消息更新，需每次重读
    if (target.source !== 'opencode' && cached && cached.mtime === stat.mtimeMs && cached.size === stat.size) {
      continue;
    }

    let lines: string[];
    try {
      lines = readTargetLines(target);
    } catch {
      continue;
    }

    let startLine: number;
    if (cached?.last_hash && lines.length > 0) {
      // 判断旧内容前缀是否完好：上一轮最后已处理行仍位于其在旧文件中的位置
      const oldIdx = (cached.last_line ?? 0) - 1;
      const oldLine = oldIdx >= 0 && oldIdx < lines.length ? lines[oldIdx] : undefined;
      const prefixIntact =
        oldLine !== undefined && hashLine(oldLine) === cached.last_hash;
      if (prefixIntact) {
        // 纯追加：从上次的 last_line 继续增量解析
        startLine = (cached.last_line ?? 0) > lines.length ? 0 : (cached.last_line ?? 0);
      } else {
        // 内容已变化（轮转/替换/截断）：从最后已处理行的下一行恢复，找不到则从头解析
        const idx = lines.findIndex((l) => hashLine(l) === cached.last_hash);
        startLine = idx >= 0 ? idx + 1 : 0;
      }
    } else {
      startLine = 0;
    }

    const newLines = startLine > 0 ? lines.slice(startLine) : lines;
    if (newLines.length === 0) {
      const lastLine = lines[lines.length - 1];
      meta.files[target.path] = {
        mtime: stat.mtimeMs,
        size: stat.size,
        last_line: lines.length,
        last_hash: lastLine !== undefined ? hashLine(lastLine) : (cached?.last_hash ?? ''),
      };
      continue;
    }

    const project = extractProject(target.source, target.path, lines);

    for (const line of newLines) {
      const entry = parseLine(line, target.source);
      if (!entry) continue;
      entry.project = project;

      newEntries++;

      const ts = new Date(entry.timestamp).getTime();
      const bucketStart = floorToBucket(ts);
      const key = bucketKey(bucketStart, entry.source, entry.model, entry.project);
      const existing = bucketMap.get(key);
      if (existing) {
        existing.input_tokens += entry.usage.input_tokens;
        existing.output_tokens += entry.usage.output_tokens;
        existing.cached_input_tokens += entry.usage.cached_input_tokens;
        existing.cache_creation_input_tokens += entry.usage.cache_creation_input_tokens;
        existing.reasoning_output_tokens += entry.usage.reasoning_output_tokens;
        existing.total_tokens +=
          entry.usage.input_tokens +
          entry.usage.output_tokens +
          entry.usage.cached_input_tokens +
          entry.usage.cache_creation_input_tokens +
          entry.usage.reasoning_output_tokens;
        existing.rounds += 1;
      } else {
        const total =
          entry.usage.input_tokens +
          entry.usage.output_tokens +
          entry.usage.cached_input_tokens +
          entry.usage.cache_creation_input_tokens +
          entry.usage.reasoning_output_tokens;
        bucketMap.set(key, {
          bucket_start: new Date(bucketStart).toISOString(),
          source: entry.source,
          model: entry.model,
          project: entry.project,
          input_tokens: entry.usage.input_tokens,
          output_tokens: entry.usage.output_tokens,
          cached_input_tokens: entry.usage.cached_input_tokens,
          cache_creation_input_tokens: entry.usage.cache_creation_input_tokens,
          reasoning_output_tokens: entry.usage.reasoning_output_tokens,
          total_tokens: total,
          rounds: 1,
        });
      }
    }

    const lastProcessed = lines[Math.min(startLine + newLines.length, lines.length) - 1];
    meta.files[target.path] = {
      mtime: stat.mtimeMs,
      size: stat.size,
      last_line: lines.length,
      last_hash: lastProcessed ? hashLine(lastProcessed) : (cached?.last_hash ?? ''),
    };
  }

  const cutoff = Date.now() - RETENTION_MS;
  const allBuckets = Array.from(bucketMap.values())
    .filter((b) => new Date(b.bucket_start).getTime() >= cutoff)
    .sort((a, b) => a.bucket_start.localeCompare(b.bucket_start));
  saveBuckets(allBuckets);
  meta.last_scan = new Date().toISOString();
  saveScanMeta(meta);

  return {
    scanned: targets.length,
    new_entries: newEntries,
    total_buckets: allBuckets.length,
    sources: Array.from(sources),
  };
}

// ─── 查询：汇总统计 ───

export function getBuckets(): TokenBucket[] {
  return loadBuckets();
}

export function getSummary(): TokenSummary {
  const buckets = loadBuckets();
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  let today = 0;
  let todayInput = 0;
  let todayOutput = 0;
  let todayCached = 0;
  let todayCacheCreation = 0;
  let todayReasoning = 0;
  let sevenDay = 0;
  let allTime = 0;

  const bySourceMap = new Map<string, number>();
  const byModelMap = new Map<string, number>();

  for (const b of buckets) {
    const ts = new Date(b.bucket_start).getTime();
    allTime += b.total_tokens;
    if (ts >= sevenDaysAgo) sevenDay += b.total_tokens;
    if (ts >= todayStart.getTime()) {
      today += b.total_tokens;
      todayInput += b.input_tokens;
      todayOutput += b.output_tokens;
      todayCached += b.cached_input_tokens;
      todayCacheCreation += b.cache_creation_input_tokens;
      todayReasoning += b.reasoning_output_tokens;
      bySourceMap.set(b.source, (bySourceMap.get(b.source) ?? 0) + b.total_tokens);
      byModelMap.set(b.model, (byModelMap.get(b.model) ?? 0) + b.total_tokens);
    }
  }

  const toBreakdown = (m: Map<string, number>): TokenBreakdownItem[] =>
    Array.from(m.entries())
      .filter(([, tokens]) => tokens > 0)
      .map(([name, tokens]) => ({ name, tokens }))
      .sort((a, b) => b.tokens - a.tokens);

  return {
    today,
    today_input: todayInput,
    today_output: todayOutput,
    today_cached: todayCached,
    today_cache_creation: todayCacheCreation,
    today_reasoning: todayReasoning,
    seven_day: sevenDay,
    all_time: allTime,
    updated_at: new Date().toISOString(),
    by_source: toBreakdown(bySourceMap),
    by_model: toBreakdown(byModelMap),
  };
}

// ─── 报表：基于桶数据 ───

export function generateDailyReport(days: number): DailyReport[] {
  if (days <= 0) return [];
  const buckets = loadBuckets();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const dayMap = new Map<string, DailyReport>();
  for (const b of buckets) {
    const ts = new Date(b.bucket_start).getTime();
    if (ts < cutoff) continue;
    const date = b.bucket_start.slice(0, 10);
    const existing = dayMap.get(date);
    if (existing) {
      existing.rounds += b.rounds;
      existing.input_tokens += b.input_tokens;
      existing.output_tokens += b.output_tokens;
      existing.cached_input_tokens += b.cached_input_tokens;
      existing.cache_creation_input_tokens += b.cache_creation_input_tokens;
      existing.reasoning_output_tokens += b.reasoning_output_tokens;
      existing.total_tokens += b.total_tokens;
    } else {
      dayMap.set(date, {
        date,
        rounds: b.rounds,
        input_tokens: b.input_tokens,
        output_tokens: b.output_tokens,
        cached_input_tokens: b.cached_input_tokens,
        cache_creation_input_tokens: b.cache_creation_input_tokens,
        reasoning_output_tokens: b.reasoning_output_tokens,
        total_tokens: b.total_tokens,
      });
    }
  }

  return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function formatReport(days: number): string {
  const report = generateDailyReport(days);
  if (report.length === 0) return `近 ${days} 天无 token 用量记录。`;

  const lines: string[] = [];
  lines.push(`Token 用量统计 (近 ${days} 天)`);
  lines.push('');
  lines.push('日期         轮次    输入        输出        总计');
  lines.push('─'.repeat(55));

  let totalRounds = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalAll = 0;

  for (const day of report) {
    totalRounds += day.rounds;
    totalInput += day.input_tokens;
    totalOutput += day.output_tokens;
    totalAll += day.total_tokens;
    lines.push(
      `${day.date}  ${String(day.rounds).padStart(5)}  ${formatNumber(day.input_tokens).padStart(8)}  ${formatNumber(day.output_tokens).padStart(8)}  ${formatNumber(day.total_tokens).padStart(8)}`
    );
  }

  lines.push('─'.repeat(55));
  lines.push(
    `合计         ${String(totalRounds).padStart(5)}  ${formatNumber(totalInput).padStart(8)}  ${formatNumber(totalOutput).padStart(8)}  ${formatNumber(totalAll).padStart(8)}`
  );
  lines.push('');
  lines.push(`桶数据文件: ${BUCKET_FILE}`);

  return lines.join('\n');
}

/** 清空所有 token 数据（桶 + 扫描元数据） */
export function clearAll(): void {
  ensureDataDir();
  writeFileSync(BUCKET_FILE, '[]', 'utf-8');
  writeFileSync(SCAN_META_FILE, JSON.stringify({ files: {}, last_scan: '' }), 'utf-8');
}
