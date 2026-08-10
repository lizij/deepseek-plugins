import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 在模块加载前设置 HOME，使 DATA_DIR 指向临时目录（os.homedir() 读取 $HOME）
const TEST_HOME = join(tmpdir(), `token-counter-report-test-${process.pid}`);
const DATA_DIR = join(TEST_HOME, '.deepseek-plugins');
const BUCKET_FILE = join(DATA_DIR, 'token-buckets.json');

let counter: typeof import('../src/counter.js');

function writeBuckets(buckets: unknown[]) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(BUCKET_FILE, JSON.stringify(buckets), 'utf-8');
}

function mkBucket(over: Partial<any> = {}) {
  return {
    bucket_start: new Date().toISOString(),
    source: 'claude-code',
    model: 'claude-sonnet-4-20250514',
    project: 'demo-proj',
    input_tokens: 1000,
    output_tokens: 500,
    cached_input_tokens: 200,
    cache_creation_input_tokens: 100,
    reasoning_output_tokens: 50,
    total_tokens: 1850,
    rounds: 1,
    ...over,
  };
}

describe('token-counter 汇总/报表', () => {
  beforeAll(async () => {
    process.env.HOME = TEST_HOME;
    rmSync(TEST_HOME, { recursive: true, force: true });
    counter = await import('../src/counter.js');
  });

  afterAll(() => {
    rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('getSummary 应正确汇总今日/近7天/累计', () => {
    const old = new Date();
    old.setDate(old.getDate() - 30);
    writeBuckets([mkBucket(), mkBucket({ input_tokens: 100, total_tokens: 950, rounds: 1 }), mkBucket({ bucket_start: old.toISOString() })]);

    const summary = counter.getSummary();
    // 今日桶：2 个（第一个 + 第二个），第三个是 30 天前不计入今日/近7天
    expect(summary.today_input).toBe(1100);
    expect(summary.today_output).toBe(1000);
    expect(summary.today_cached).toBe(400);
    expect(summary.today_cache_creation).toBe(200);
    expect(summary.today_reasoning).toBe(100);
    expect(summary.today).toBe(summary.today_input + summary.today_output + summary.today_cached + summary.today_cache_creation + summary.today_reasoning);
    // 7 天口径不含 30 天前
    expect(summary.seven_day).toBe(2800);
    // 累计含 30 天前桶
    expect(summary.all_time).toBe(4650);
  });

  it('getSummary 应按 source / model 拆分今日用量', () => {
    writeBuckets([
      mkBucket({ source: 'claude-code', model: 'm-a', total_tokens: 1000 }),
      mkBucket({ source: 'claude-code', model: 'm-b', total_tokens: 2000 }),
      mkBucket({ source: 'opencode', model: 'm-a', total_tokens: 500 }),
      mkBucket({ bucket_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), source: 'opencode', model: 'm-old', total_tokens: 9999 }),
    ]);

    const summary = counter.getSummary();
    // 仅今日桶参与拆分，30 天前桶不计入
    expect(summary.by_source).toEqual([
      { name: 'claude-code', tokens: 3000 },
      { name: 'opencode', tokens: 500 },
    ]);
    expect(summary.by_model).toEqual([
      { name: 'm-b', tokens: 2000 },
      { name: 'm-a', tokens: 1500 },
    ]);
    // 按 tokens 降序
    expect(summary.by_source[0].tokens).toBeGreaterThanOrEqual(summary.by_source[1].tokens);
  });

  it('generateDailyReport 应按天聚合数据', () => {
    writeBuckets([mkBucket(), mkBucket(), mkBucket({ bucket_start: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() })]);
    const report = counter.generateDailyReport(7);
    expect(report).toHaveLength(2);
    const todayRow = report.find((r) => r.date === new Date().toISOString().slice(0, 10));
    expect(todayRow!.rounds).toBe(2);
    expect(todayRow!.input_tokens).toBe(2000);
    expect(todayRow!.total_tokens).toBe(3700);
  });

  it('generateDailyReport 应按 days 过滤数据', () => {
    writeBuckets([mkBucket({ bucket_start: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() })]);
    expect(counter.generateDailyReport(1)).toHaveLength(0);
    expect(counter.generateDailyReport(30).length).toBeGreaterThanOrEqual(1);
  });

  it('formatReport 应返回提示当无数据时', () => {
    writeBuckets([]);
    expect(counter.formatReport(7)).toContain('无');
  });

  it('formatReport 应生成带表格的报告', () => {
    writeBuckets([mkBucket()]);
    const report = counter.formatReport(7);
    expect(report).toContain('Token 用量统计');
    expect(report).toContain('1.0K');
    expect(report).toContain('1.9K');
  });

  it('clearAll 应清空所有数据', () => {
    counter.clearAll();
    expect(counter.getBuckets()).toHaveLength(0);
    expect(counter.getSummary().all_time).toBe(0);
    expect(existsSync(BUCKET_FILE)).toBe(true);
  });
});
