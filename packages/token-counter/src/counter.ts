import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DATA_DIR = join(homedir(), '.deepseek-plugins');
const LOG_FILE = join(DATA_DIR, 'token-usage.log');

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

export function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

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
    const date = e.timestamp.slice(0, 10); // YYYY-MM-DD
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

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
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