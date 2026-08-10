import { execSync } from 'node:child_process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = resolve(__dirname, '..', 'dist', 'deepseek-plugin-cli');
const TEST_HOME = join(tmpdir(), `cli-token-test-${process.pid}`);
const DATA_DIR = join(TEST_HOME, '.deepseek-plugins');

function run(args: string, stdin?: string): string {
  const opts: any = {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, HOME: TEST_HOME },
  };
  if (stdin !== undefined) {
    opts.input = stdin;
  }
  return execSync(`${CLI} ${args}`, opts);
}

function writeBuckets(buckets: unknown[]) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, 'token-buckets.json'), JSON.stringify(buckets), 'utf-8');
}

function mkBucket(over: Record<string, unknown> = {}) {
  return {
    bucket_start: new Date().toISOString(),
    source: 'claude-code',
    model: 'deepseek-v4-flash',
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

describe('token', () => {
  beforeAll(() => {
    rmSync(TEST_HOME, { recursive: true, force: true });
    mkdirSync(DATA_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('token --help 显示子命令', () => {
    const out = run('token --help');
    expect(out).toContain('scan');
    expect(out).toContain('today');
    expect(out).toContain('buckets');
    expect(out).toContain('report');
  });

  it('token scan 无数据源时正常输出', () => {
    const out = run('token scan');
    expect(out).toContain('扫描完成');
  });

  it('token today 显示汇总', () => {
    writeBuckets([mkBucket()]);
    const out = run('token today');
    expect(out).toContain('今日 Token 用量');
    expect(out).toContain('推理');
  });

  it('token today --json 输出 JSON（含新增分类字段）', () => {
    const out = run('token today --json');
    const json = JSON.parse(out);
    expect(json.today).toBe(1850);
    expect(json.today_input).toBe(1000);
    expect(json.today_output).toBe(500);
    expect(json.today_cached).toBe(200);
    expect(json.today_cache_creation).toBe(100);
    expect(json.today_reasoning).toBe(50);
    // 拆分字段：单桶场景各 1 项
    expect(json.by_source).toEqual([{ name: 'claude-code', tokens: 1850 }]);
    expect(json.by_model).toEqual([{ name: 'deepseek-v4-flash', tokens: 1850 }]);
  });

  it('token buckets 显示桶数据', () => {
    const out = run('token buckets');
    expect(out).toContain('deepseek-v4-flash');
    expect(out).toContain('1.9K');
  });

  it('token report 显示按日报告', () => {
    const out = run('token report --days 7');
    expect(out).toContain('Token 用量统计');
    expect(out).toContain('1.9K');
  });

  it('token report --clear-all 清空数据', () => {
    const out = run('token report --clear-all');
    expect(out).toContain('已清空');
    expect(existsSync(join(DATA_DIR, 'token-buckets.json'))).toBe(true);
  });
});
