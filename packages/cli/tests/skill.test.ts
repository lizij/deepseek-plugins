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

describe('skill', () => {
  it('skill --help 显示子命令', () => {
    const out = run('skill --help');
    expect(out).toContain('install');
    expect(out).toContain('update');
  });

  it('skill install --help 显示选项', () => {
    const out = run('skill install --help');
    expect(out).toContain('--agent');
  });

  it('skill install 正常执行', () => {
    const out = run('skill install');
    expect(out).toContain('安装完成');
    expect(out).toContain('source add --type deepseek');
    expect(out).toContain('deepseek-plugin-cli multimodal set');
  });

  it('skill install --agent claude 正常执行', () => {
    const out = run('skill install --agent claude');
    expect(out).toContain('Claude Code');
    expect(out).toContain('安装完成');
  });

  it('skill update 正常执行', () => {
    const out = run('skill update');
    expect(out).toContain('更新完成');
  });
});