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

describe('audio', () => {
  it('audio --help 显示参数', () => {
    const out = run('audio --help');
    expect(out).toContain('<input>');
    expect(out).toContain('--prompt');
  });

  it('audio 缺少输入参数报错', () => {
    expect(() => run('audio')).toThrow();
  });

  it('audio 本地文件不存在时报错', () => {
    const { stderr, status } = runOrError('audio /tmp/nonexistent-audio-xyz.mp3');
    expect(status).not.toBe(0);
    expect(stderr).toContain('ENOENT');
  });
});

describe('pdf', () => {
  it('pdf --help 显示参数', () => {
    const out = run('pdf --help');
    expect(out).toContain('<input>');
    expect(out).toContain('--prompt');
  });

  it('pdf 缺少输入参数报错', () => {
    expect(() => run('pdf')).toThrow();
  });

  it('pdf 本地文件不存在时报错', () => {
    const { stderr, status } = runOrError('pdf /tmp/nonexistent-doc-xyz.pdf');
    expect(status).not.toBe(0);
    expect(stderr).toContain('ENOENT');
  });
});

describe('gui', () => {
  it('gui --help 显示选项', () => {
    const out = run('gui --help');
    expect(out).toContain('--no-open');
  });
});

describe('menubar', () => {
  it('menubar --help 显示选项', () => {
    const out = run('menubar --help');
    expect(out).toContain('--build');
  });
});

describe('service', () => {
  it('service --help 显示子命令', () => {
    const out = run('service --help');
    expect(out).toContain('status');
    expect(out).toContain('stop');
  });

  it('service status --help 显示说明', () => {
    const out = run('service status --help');
    expect(out).toContain('查看后台服务运行状态');
  });

  it('service stop --help 显示说明', () => {
    const out = run('service stop --help');
    expect(out).toContain('终止后台服务');
  });

  it('service status 未运行时正常输出', () => {
    // 测试环境下通常没有运行中的后台服务
    const { stdout, status } = runOrError('service status');
    expect(status).toBe(0);
    expect(stdout).toMatch(/后台服务未运行|后台服务运行中/);
  });
});
