import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { logUsage, readEntries, generateReport, formatReport, clearLog, ensureDataDir } from '../src/counter.js';

const LOG_FILE = join(homedir(), '.deepseek-plugins', 'token-usage.log');

function removeLogFile() {
  if (existsSync(LOG_FILE)) {
    unlinkSync(LOG_FILE);
  }
}

describe('token-counter', () => {
  beforeEach(() => {
    removeLogFile();
  });

  afterEach(() => {
    removeLogFile();
  });

  describe('logUsage', () => {
    it('应正确解析 statusline JSON 并写入日志', () => {
      const json = JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        usage: {
          input_tokens_this_turn: 1234,
          output_tokens_this_turn: 567,
        },
      });

      const entry = logUsage(json);
      expect(entry).not.toBeNull();
      expect(entry!.model).toBe('claude-sonnet-4-20250514');
      expect(entry!.input_tokens).toBe(1234);
      expect(entry!.output_tokens).toBe(567);
      expect(entry!.timestamp).toBeTruthy();
    });

    it('应处理缺失 usage 字段的 JSON', () => {
      const json = JSON.stringify({ model: 'test' });
      const entry = logUsage(json);
      expect(entry).not.toBeNull();
      expect(entry!.input_tokens).toBe(0);
      expect(entry!.output_tokens).toBe(0);
    });

    it('应返回 null 当 JSON 无效时', () => {
      const entry = logUsage('invalid json');
      expect(entry).toBeNull();
    });
  });

  describe('readEntries', () => {
    it('应返回空数组当无日志文件时', () => {
      const entries = readEntries();
      expect(entries).toEqual([]);
    });

    it('应正确读取多条日志', () => {
      logUsage(JSON.stringify({ usage: { input_tokens_this_turn: 100, output_tokens_this_turn: 50 } }));
      logUsage(JSON.stringify({ usage: { input_tokens_this_turn: 200, output_tokens_this_turn: 100 } }));

      const entries = readEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].input_tokens).toBe(100);
      expect(entries[1].input_tokens).toBe(200);
    });
  });

  describe('generateReport', () => {
    it('应按天聚合数据', () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);

      logUsage(JSON.stringify({ usage: { input_tokens_this_turn: 100, output_tokens_this_turn: 50 } }));
      logUsage(JSON.stringify({ usage: { input_tokens_this_turn: 200, output_tokens_this_turn: 100 } }));

      const report = generateReport(7);
      expect(report).toHaveLength(1);
      expect(report[0].date).toBe(today);
      expect(report[0].rounds).toBe(2);
      expect(report[0].input_tokens).toBe(300);
      expect(report[0].output_tokens).toBe(150);
      expect(report[0].total_tokens).toBe(450);
    });

    it('应按 days 参数过滤数据', () => {
      logUsage(JSON.stringify({ usage: { input_tokens_this_turn: 100, output_tokens_this_turn: 50 } }));
      // 刚写入的数据在 1 天内
      const report = generateReport(1);
      expect(report.length).toBeGreaterThanOrEqual(1);
      // days 为负数时所有数据都被过滤
      const reportNone = generateReport(-1);
      expect(reportNone).toHaveLength(0);
    });
  });

  describe('formatReport', () => {
    it('应返回提示当无数据时', () => {
      const report = formatReport(7);
      expect(report).toContain('无');
    });

    it('应生成带表格的报告', () => {
      logUsage(JSON.stringify({ usage: { input_tokens_this_turn: 1234, output_tokens_this_turn: 567 } }));
      const report = formatReport(7);
      expect(report).toContain('Token 用量统计');
      expect(report).toContain('1.2K');
      expect(report).toContain('567');
      expect(report).toContain('1.8K');
    });
  });

  describe('clearLog', () => {
    it('应清空日志', () => {
      logUsage(JSON.stringify({ usage: { input_tokens_this_turn: 100, output_tokens_this_turn: 50 } }));
      expect(readEntries()).toHaveLength(1);
      clearLog();
      expect(readEntries()).toHaveLength(0);
    });
  });
});