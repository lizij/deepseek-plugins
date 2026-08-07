import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CLI = resolve(__dirname, '..', 'dist', 'deepseek-plugin-cli');
const LOG_FILE = join(homedir(), '.deepseek-plugins', 'token-usage.log');

function run(args: string, stdin?: string): string {
  const opts: any = {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  };
  if (stdin !== undefined) {
    opts.input = stdin;
  }
  return execSync(`${CLI} ${args}`, opts);
}

function removeLogFile() {
  if (existsSync(LOG_FILE)) {
    unlinkSync(LOG_FILE);
  }
}

describe('token', () => {
  beforeEach(() => {
    removeLogFile();
  });

  afterEach(() => {
    removeLogFile();
  });

  it('token --help 显示子命令', () => {
    const out = run('token --help');
    expect(out).toContain('log');
    expect(out).toContain('report');
    expect(out).toContain('Token');
  });

  it('token log 写入模拟 statusline 数据', () => {
    const json = JSON.stringify({
      model: 'deepseek-v4-flash',
      usage: {
        input_tokens_this_turn: 1234,
        output_tokens_this_turn: 567,
      },
    });
    run('token log', json);
    // 验证日志文件存在且包含数据
    expect(existsSync(LOG_FILE)).toBe(true);
  });

  it('token report 显示报告', () => {
    // 模拟多轮对话
    const rounds = [
      { model: 'deepseek-v4-flash', usage: { input_tokens_this_turn: 1000, output_tokens_this_turn: 500 } },
      { model: 'deepseek-v4-flash', usage: { input_tokens_this_turn: 2000, output_tokens_this_turn: 800 } },
      { model: 'deepseek-v4-pro', usage: { input_tokens_this_turn: 3000, output_tokens_this_turn: 1200 } },
    ];

    for (const round of rounds) {
      run('token log', JSON.stringify(round));
    }

    const out = run('token report --days 7');
    expect(out).toContain('Token 用量统计');
    expect(out).toContain('6.0K');  // 6000 input
    expect(out).toContain('2.5K');  // 2500 output
    expect(out).toContain('8.5K');  // 8500 total
    expect(out).toContain('3');     // 3 rounds
  });

  it('token report --clear 清空日志', () => {
    run('token log', JSON.stringify({ usage: { input_tokens_this_turn: 100, output_tokens_this_turn: 50 } }));
    expect(existsSync(LOG_FILE)).toBe(true);

    const out = run('token report --clear');
    expect(out).toContain('已清空');
  });
});