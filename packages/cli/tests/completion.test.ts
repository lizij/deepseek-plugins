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

describe('completion', () => {
  it('completion --help 显示说明', () => {
    const out = run('completion --help');
    expect(out).toContain('zsh');
    expect(out).toContain('bash');
  });

  it('completion 默认输出 zsh 补全脚本', () => {
    const out = run('completion');
    expect(out).toContain('compdef _deepseek_plugin_cli deepseek-plugin-cli');
    expect(out).toContain('_deepseek_auth');
    expect(out).toContain('_deepseek_vision');
  });

  it('completion zsh 输出 zsh 补全脚本', () => {
    const out = run('completion zsh');
    expect(out).toContain('compdef _deepseek_plugin_cli deepseek-plugin-cli');
    expect(out).toContain('auth');
    expect(out).toContain('balance');
  });

  it('completion bash 输出 bash 补全脚本', () => {
    const out = run('completion bash');
    expect(out).toContain('complete -F _deepseek_plugin_cli_completion deepseek-plugin-cli');
    expect(out).toContain('COMPREPLY');
  });

  it('completion 不支持的 shell 报错', () => {
    expect(() => run('completion fish')).toThrow();
  });
});
