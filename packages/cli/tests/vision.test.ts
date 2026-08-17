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
    expect(stderr).toContain('Allowed choices are low, high');
  });

  it('vision 本地文件不存在时报错', () => {
    const { stderr, status } = runOrError('vision /tmp/nonexistent-file-xyz.png');
    expect(status).not.toBe(0);
    expect(stderr).toContain('ENOENT');
  });

  it('multimodal set --help 显示选项', () => {
    const out = run('multimodal set --help');
    expect(out).toContain('--base-url');
    expect(out).toContain('--model');
    expect(out).toContain('--api-key');
  });

  it('multimodal set 无参数时报错', () => {
    const { stderr, status } = runOrError('multimodal set');
    expect(status).not.toBe(0);
    expect(stderr).toContain('请至少提供一项');
  });

  describe('multimodal 子命令', () => {
    it('multimodal --help 显示子命令', () => {
      const out = run('multimodal --help');
      expect(out).toContain('list');
      expect(out).toContain('set');
      expect(out).toContain('add');
      expect(out).toContain('update');
      expect(out).toContain('remove');
      expect(out).toContain('move');
    });

    it('multimodal add --help 显示选项', () => {
      const out = run('multimodal add --help');
      expect(out).toContain('--base-url');
      expect(out).toContain('--model');
      expect(out).toContain('--api-key');
    });

    it('multimodal add 缺少参数时报错', () => {
      expect(() => run('multimodal add')).toThrow();
    });

    it('multimodal list 正常执行', () => {
      const out = run('multimodal list');
      expect(typeof out).toBe('string');
    });

    it('multimodal remove 无效索引报错', () => {
      const { stderr, status } = runOrError('multimodal remove abc');
      expect(status).not.toBe(0);
      expect(stderr).toContain('有效的模型索引');
    });

    it('multimodal move 无效方向报错', () => {
      const { stderr, status } = runOrError('multimodal move 0 left');
      expect(status).not.toBe(0);
      expect(stderr).toContain('方向必须是 up 或 down');
    });
  });
});