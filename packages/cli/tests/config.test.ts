import { execSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { existsSync, unlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

describe('config', () => {
  it('config --help 显示子命令', () => {
    const out = run('config --help');
    expect(out).toContain('init');
    expect(out).toContain('export');
    expect(out).toContain('import');
  });

  it('config init --help 显示说明', () => {
    const out = run('config init --help');
    expect(out).toContain('交互式初始化向导');
  });

  it('config export --help 显示说明', () => {
    const out = run('config export --help');
    expect(out).toContain('导出');
    expect(out).toContain('JSON');
  });

  it('config import --help 显示说明', () => {
    const out = run('config import --help');
    expect(out).toContain('导入');
    expect(out).toContain('JSON');
  });

  it('config export 导出配置到文件', () => {
    const file = join(tmpdir(), `dsp-test-export-${Date.now()}.json`);
    try {
      const { stdout, status } = runOrError(`config export ${file}`);
      // 如果有配置，导出成功；如果没有配置，会报错
      if (status === 0) {
        expect(stdout).toContain('已导出');
        expect(existsSync(file)).toBe(true);
        const data = JSON.parse(readFileSync(file, 'utf-8'));
        expect(typeof data).toBe('object');
      } else {
        expect(stdout).toContain('没有任何配置可导出');
      }
    } finally {
      if (existsSync(file)) unlinkSync(file);
    }
  });

  it('config import 不存在的文件报错', () => {
    const { status } = runOrError('config import /tmp/nonexistent-config-xyz.json');
    expect(status).not.toBe(0);
  });

  it('config import 无效 JSON 报错', () => {
    const file = join(tmpdir(), `dsp-test-invalid-${Date.now()}.json`);
    writeFileSync(file, 'not valid json{{{', 'utf-8');
    try {
      const { status } = runOrError(`config import ${file}`);
      expect(status).not.toBe(0);
    } finally {
      unlinkSync(file);
    }
  });
});
