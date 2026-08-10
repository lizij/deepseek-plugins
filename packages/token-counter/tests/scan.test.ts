import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 在模块加载前设置 HOME，使 DATA_DIR 指向临时目录（os.homedir() 读取 $HOME）
const TEST_HOME = join(tmpdir(), `token-counter-test-${process.pid}`);
const CLAUDE_DIR = join(TEST_HOME, '.claude', 'projects', 'test-proj');

let counter: typeof import('../src/counter.js');

function writeClaudeLog(lines: string[]) {
  mkdirSync(CLAUDE_DIR, { recursive: true });
  writeFileSync(join(CLAUDE_DIR, 'session.jsonl'), lines.join('\n') + '\n', 'utf-8');
}

function assistantLine(input: number, output: number, ts: string): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: ts,
    message: {
      model: 'claude-sonnet-4-20250514',
      role: 'assistant',
      usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, reasoning_output_tokens: 0 },
    },
  });
}

function userLineWithCwd(ts: string, cwd: string): string {
  return JSON.stringify({
    type: 'user',
    timestamp: ts,
    cwd,
    message: { role: 'user', content: [] },
  });
}

describe('token-counter 扫描/聚合', () => {
  beforeAll(async () => {
    process.env.HOME = TEST_HOME;
    rmSync(TEST_HOME, { recursive: true, force: true });
    counter = await import('../src/counter.js');
  });

  afterAll(() => {
    rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('scanAndAggregate 应扫描 claude 日志并聚合到桶', () => {
    writeClaudeLog([
      assistantLine(1000, 500, '2026-08-10T10:00:00.000Z'),
      assistantLine(2000, 800, '2026-08-10T10:05:00.000Z'),
    ]);

    const result = counter.scanAndAggregate();
    expect(result.scanned).toBeGreaterThanOrEqual(1);
    expect(result.new_entries).toBe(2);
    expect(result.sources).toContain('claude-code');

    const buckets = counter.getBuckets();
    expect(buckets.length).toBeGreaterThanOrEqual(1);
    // 两条记录在同一 30 分钟桶内
    const bucket = buckets.find((b) => b.source === 'claude-code');
    expect(bucket).toBeDefined();
    expect(bucket!.input_tokens).toBe(3000);
    expect(bucket!.output_tokens).toBe(1300);
    expect(bucket!.total_tokens).toBe(4300);
    expect(bucket!.rounds).toBe(2);
  });

  it('增量扫描不应重复计数', () => {
    // 追加一条新记录
    writeClaudeLog([
      assistantLine(1000, 500, '2026-08-10T10:00:00.000Z'),
      assistantLine(2000, 800, '2026-08-10T10:05:00.000Z'),
      assistantLine(500, 100, '2026-08-10T10:10:00.000Z'),
    ]);

    const result = counter.scanAndAggregate();
    expect(result.new_entries).toBe(1); // 只解析新增的 1 条

    const buckets = counter.getBuckets();
    const bucket = buckets.find((b) => b.source === 'claude-code');
    expect(bucket!.input_tokens).toBe(3500);
    expect(bucket!.rounds).toBe(3);
  });

  it('文件截断后保留最后已处理行不应重复计数', () => {
    // 模拟日志轮转：文件被截断，仅保留最后已处理行
    writeClaudeLog([assistantLine(500, 100, '2026-08-10T10:10:00.000Z')]);

    const result = counter.scanAndAggregate();
    // 截断后仅剩最后已处理行，应通过 last_hash 识别并跳过，不产生新记录
    expect(result.new_entries).toBe(0);

    const bucket = counter.getBuckets().find((b) => b.source === 'claude-code');
    expect(bucket!.input_tokens).toBe(3500);
    expect(bucket!.rounds).toBe(3);
  });

  it('文件被完全替换为新内容时应从头解析', () => {
    // 模拟日志轮转：旧内容移除，写入全新的一行
    writeClaudeLog([assistantLine(700, 300, '2026-08-10T11:00:00.000Z')]);

    const result = counter.scanAndAggregate();
    expect(result.new_entries).toBe(1);

    const buckets = counter.getBuckets().filter((b) => b.source === 'claude-code');
    const totalInput = buckets.reduce((s, b) => s + b.input_tokens, 0);
    const totalRounds = buckets.reduce((s, b) => s + b.rounds, 0);
    expect(totalInput).toBe(4200);
    expect(totalRounds).toBe(4);
  });

  it('getSummary 应正确汇总今日/近7天/累计', () => {
    const summary = counter.getSummary();
    expect(summary.today).toBeGreaterThan(0);
    expect(summary.today_input).toBeGreaterThan(0);
    expect(summary.today_output).toBeGreaterThan(0);
    expect(summary.seven_day).toBeGreaterThanOrEqual(summary.today);
    expect(summary.all_time).toBeGreaterThanOrEqual(summary.seven_day);
    expect(summary.updated_at).toBeTruthy();
  });

  it('项目名应从 cwd 提取', () => {
    counter.clearAll();
    writeClaudeLog([
      userLineWithCwd('2026-08-10T12:00:00.000Z', '/Users/me/Projects/ad_base_sdk'),
      assistantLine(100, 50, '2026-08-10T12:01:00.000Z'),
    ]);
    counter.scanAndAggregate();
    const bucket = counter.getBuckets().find((b) => b.source === 'claude-code');
    expect(bucket).toBeDefined();
    expect(bucket!.project).toBe('ad_base_sdk');
  });

  it('clearAll 应清空所有数据', () => {
    counter.clearAll();
    const buckets = counter.getBuckets();
    expect(buckets).toHaveLength(0);
    const summary = counter.getSummary();
    expect(summary.all_time).toBe(0);
  });
});
