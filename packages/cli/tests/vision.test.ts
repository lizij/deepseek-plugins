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

function runOrError(args: string): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execSync(`node ${CLI} ${args}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', status: 0 };
  } catch (e: any) {
    return {
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
      status: e.status ?? 1,
    };
  }
}

describe('vision', () => {
  it('vision --help 显示参数', () => {
    const out = run('vision --help');
    expect(out).toContain('<image>');
    expect(out).toContain('--prompt');
    expect(out).toContain('--detail');
  });

  it('vision 缺少图片参数报错', () => {
    expect(() => run('vision')).toThrow();
  });

  it('vision --detail 无效值报错', () => {
    const { stderr, status } = runOrError('vision /tmp/test.png --detail invalid');
    expect(status).not.toBe(0);
    expect(stderr).toContain('仅支持 low 或 high');
  });

  it('vision 本地文件不存在时报错', () => {
    const { stderr, status } = runOrError('vision /tmp/nonexistent-file-xyz.png');
    expect(status).not.toBe(0);
    expect(stderr).toContain('ENOENT');
  });

  it('vision config --help 显示选项', () => {
    const out = run('vision config --help');
    expect(out).toContain('--base-url');
    expect(out).toContain('--model');
  });

  it('vision config 无参数时报错', () => {
    const { stderr, status } = runOrError('vision config');
    expect(status).not.toBe(0);
    expect(stderr).toContain('请提供');
  });
});