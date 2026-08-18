import { execSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';

const CLI = resolve(__dirname, '..', 'dist', 'deepseek-plugin-cli');

function run(args: string): string {
  return execSync(`${CLI} ${args}`, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

describe('balance', () => {
  it('balance --help 显示选项', () => {
    const out = run('balance --help');
    expect(out).toContain('--json');
    expect(out).toContain('余额');
  });

  it('balance 正常查询余额', () => {
    const out = run('balance');
    expect(out).toContain('账户状态');
    expect(out).toContain('CNY');
    expect(out).toContain('总额');
    expect(out).toContain('充值');
    expect(out).toContain('赠金');
  });

  it('balance --json 输出 JSON', () => {
    const out = run('balance --json');
    const data = JSON.parse(out);
    // 多来源格式：数组，每个元素包含 source 和 result
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    const first = data[0];
    expect(first).toHaveProperty('source');
    expect(first).toHaveProperty('result');
    expect(first.result).toHaveProperty('isAvailable');
    expect(first.result).toHaveProperty('balances');
    expect(Array.isArray(first.result.balances)).toBe(true);
    expect(first.result.balances.length).toBeGreaterThan(0);
    expect(first.result.balances[0]).toHaveProperty('currency');
    expect(first.result.balances[0]).toHaveProperty('totalBalance');
  });
});