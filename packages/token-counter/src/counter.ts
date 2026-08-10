import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DATA_DIR = join(homedir(), '.deepseek-plugins');
const LOG_FILE = join(DATA_DIR, 'token-usage.log');
const BUCKET_FILE = join(DATA_DIR, 'token-buckets.json');
const SCAN_META_FILE = join(DATA_DIR, 'token-scan-meta.json');

const BUCKET_MS = 30 * 60 * 1000;

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

export interface TokenSummary {
  today: number;
  today_input: number;
  today_output: number;
  today_cached: number;
  seven_day: number;
  all_time: number;
  updated_at: string;
}

interface StatusLineInput {
  model?: string;
  context_window?: { used?: number; total?: number };
  usage?: {
    input_tokens_this_turn?: number;
    output_tokens_this_turn?: number;
  };
}

interface LogEntry {
  timestamp: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

interface DailyReport {
  date: string;
  rounds: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

interface ScanMeta {
  files: Record<string, { mtime: number; size: number; last_line: number }>;
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

function safeParseTime(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') return Date.now();
  const ts = new Date(value as string).getTime();
  return isNaN(ts) ? Date.now() : ts;
}

function bucketKey(bucketStart: number, source: string, model: string, project: string): string {
  return `${bucketStart}|${source}|${model}|${project}`;
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
  return [...findClaudeCodeLogs(), ...findCodexLogs(), ...findCursorLogs()];
}

// ─── 解析器：从日志行提取 token 数据 ───

function extractProjectFromPath(filePath: string, source: string): string {
  if (source === 'claude-code') {
    // ~/.claude/projects/<project-encoded>/<session>.jsonl
    const parts = filePath.split('/');
    const idx = parts.lastIndexOf('projects');
    if (idx >= 0 && idx + 1 < parts.length) {
      const encoded = parts[idx + 1] ?? '';
      const decoded = encoded.replace(/^-/, '').split('-').filter(Boolean);
      return decoded[decoded.length - 1] || 'unknown';
    }
  }
  return 'unknown';
}

function parseClaudeCodeLine(line: string): TokenEntry | null {
  try {
    const obj = JSON.parse(line);
    if (obj.type !== 'assistant') return null;
    const msg = obj.message;
    if (!msg || !msg.usage) return null;
    const usage = msg.usage;
    const ts = safeParseTime(obj.timestamp);
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
    default:
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
    let stat;
    try {
      stat = statSync(target.path);
    } catch {
      continue;
    }

    const cached = meta.files[target.path];
    const startLine = cached?.last_line ?? 0;

    // 文件未变化则跳过
    if (cached && cached.mtime === stat.mtimeMs && cached.size === stat.size) {
      continue;
    }

    let lines: string[];
    try {
      const content = readFileSync(target.path, 'utf-8');
      lines = content.split('\n').filter((l) => l.trim().length > 0);
    } catch {
      continue;
    }

    // 增量：只解析新增行
    const newLines = startLine > 0 ? lines.slice(startLine) : lines;
    if (newLines.length === 0) {
      meta.files[target.path] = { mtime: stat.mtimeMs, size: stat.size, last_line: lines.length };
      continue;
    }

    for (const line of newLines) {
      const entry = parseLine(line, target.source);
      if (!entry) continue;
      // 从文件路径提取 project（claude-code）
      if (entry.project === 'unknown') {
        entry.project = extractProjectFromPath(target.path, target.source);
      }
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

    meta.files[target.path] = { mtime: stat.mtimeMs, size: stat.size, last_line: lines.length };
  }

  const allBuckets = Array.from(bucketMap.values()).sort((a, b) =>
    a.bucket_start.localeCompare(b.bucket_start)
  );
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
  let sevenDay = 0;
  let allTime = 0;

  for (const b of buckets) {
    const ts = new Date(b.bucket_start).getTime();
    allTime += b.total_tokens;
    if (ts >= sevenDaysAgo) sevenDay += b.total_tokens;
    if (ts >= todayStart.getTime()) {
      today += b.total_tokens;
      todayInput += b.input_tokens;
      todayOutput += b.output_tokens;
      todayCached += b.cached_input_tokens;
    }
  }

  return {
    today,
    today_input: todayInput,
    today_output: todayOutput,
    today_cached: todayCached,
    seven_day: sevenDay,
    all_time: allTime,
    updated_at: new Date().toISOString(),
  };
}

// ─── 向后兼容：statusline 日志 ───

export function logUsage(raw: string): LogEntry | null {
  let input: StatusLineInput;
  try {
    input = JSON.parse(raw);
  } catch {
    return null;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    model: input.model ?? 'unknown',
    input_tokens: input.usage?.input_tokens_this_turn ?? 0,
    output_tokens: input.usage?.output_tokens_this_turn ?? 0,
  };

  ensureDataDir();
  appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
  return entry;
}

export function readEntries(): LogEntry[] {
  if (!existsSync(LOG_FILE)) return [];
  const content = readFileSync(LOG_FILE, 'utf-8').trim();
  if (!content) return [];
  return content
    .split('\n')
    .map((line) => {
      try {
        return JSON.parse(line) as LogEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is LogEntry => e !== null);
}

export function generateReport(days: number): DailyReport[] {
  if (days <= 0) return [];
  const entries = readEntries();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const filtered = entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff);

  const dayMap = new Map<string, DailyReport>();
  for (const e of filtered) {
    const date = e.timestamp.slice(0, 10);
    const existing = dayMap.get(date);
    if (existing) {
      existing.rounds++;
      existing.input_tokens += e.input_tokens;
      existing.output_tokens += e.output_tokens;
      existing.total_tokens += e.input_tokens + e.output_tokens;
    } else {
      dayMap.set(date, {
        date,
        rounds: 1,
        input_tokens: e.input_tokens,
        output_tokens: e.output_tokens,
        total_tokens: e.input_tokens + e.output_tokens,
      });
    }
  }

  return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function formatReport(days: number): string {
  const report = generateReport(days);
  if (report.length === 0) return `近 ${days} 天无 token 用量记录。`;

  const lines: string[] = [];
  lines.push(`Token 用量统计 (近 ${days} 天)`);
  lines.push('');
  lines.push('日期         轮次    输入        输出        总计');
  lines.push('─'.repeat(55));

  let totalRounds = 0;
  let totalInput = 0;
  let totalOutput = 0;

  for (const day of report) {
    totalRounds += day.rounds;
    totalInput += day.input_tokens;
    totalOutput += day.output_tokens;
    lines.push(
      `${day.date}  ${String(day.rounds).padStart(5)}  ${formatNumber(day.input_tokens).padStart(8)}  ${formatNumber(day.output_tokens).padStart(8)}  ${formatNumber(day.total_tokens).padStart(8)}`
    );
  }

  lines.push('─'.repeat(55));
  lines.push(
    `合计         ${String(totalRounds).padStart(5)}  ${formatNumber(totalInput).padStart(8)}  ${formatNumber(totalOutput).padStart(8)}  ${formatNumber(totalInput + totalOutput).padStart(8)}`
  );
  lines.push('');
  lines.push(`日志文件: ${LOG_FILE}`);

  return lines.join('\n');
}

export function clearLog(): void {
  ensureDataDir();
  writeFileSync(LOG_FILE, '', 'utf-8');
}

/** 清空所有 token 数据（桶 + 扫描元数据 + 日志） */
export function clearAll(): void {
  ensureDataDir();
  writeFileSync(LOG_FILE, '', 'utf-8');
  writeFileSync(BUCKET_FILE, '[]', 'utf-8');
  writeFileSync(SCAN_META_FILE, JSON.stringify({ files: {}, last_scan: '' }), 'utf-8');
}
