import {
  BUCKET_FILE,
  ensureDataDir,
  formatNumber,
  loadBuckets,
  saveBuckets,
  SCAN_META_FILE,
  writeFileAtomic,
} from './storage.js';
import type { DailyReport, TokenBreakdownItem, TokenBucket, TokenSummary } from './types.js';

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

/** 清空所有 token 数据（桶 + 扫描元数据）。经 saveBuckets 写入，同步更新内存缓存。 */
export function clearAll(): void {
  ensureDataDir();
  saveBuckets([]);
  writeFileAtomic(SCAN_META_FILE, JSON.stringify({ files: {}, last_scan: '' }));
}
