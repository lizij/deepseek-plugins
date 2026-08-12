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

function runOrError(args: string): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execSync(`${CLI} ${args}`, {
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

describe('doctor', () => {
  it('doctor --help 显示说明', () => {
    const out = run('doctor --help');
    expect(out).toContain('环境自检');
    expect(out).toContain('Node');
  });

  it('doctor 输出自检结果标题', () => {
    const { stdout } = runOrError('doctor');
    expect(stdout).toContain('环境自检结果');
    expect(stdout).toContain('Node.js 版本');
    expect(stdout).toContain('凭据文件');
  });

  it('doctor 包含 DeepSeek API Key 检查项', () => {
    const { stdout } = runOrError('doctor');
    expect(stdout).toContain('DeepSeek API Key');
  });

  it('doctor 包含多模态模型配置检查项', () => {
    const { stdout } = runOrError('doctor');
    expect(stdout).toContain('多模态模型配置');
  });
});
