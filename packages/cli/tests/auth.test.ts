import { execSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';

const CLI = resolve(__dirname, '..', 'dist', 'deepseek-plugin-cli');

function run(args: string): string {
  return execSync(`node ${CLI} ${args}`, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

describe('auth', () => {
  it('auth --help 显示子命令', () => {
    const out = run('auth --help');
    expect(out).toContain('set');
    expect(out).toContain('get');
    expect(out).toContain('unset');
    expect(out).toContain('list');
  });

  it('auth list 正常执行', () => {
    // 无 Key 时输出 "(空)" 或已注册的 service 名
    const out = run('auth list');
    expect(out).toBeDefined();
    expect(typeof out).toBe('string');
  });

  it('auth set 缺少参数报错', () => {
    expect(() => run('auth set')).toThrow();
  });
});