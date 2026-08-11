import { describe, it, expect } from 'vitest';
import {
  parseClaudeCodeLine,
  parseCodexLine,
  parseCursorLine,
  parseOpenCodeLine,
  parseLine,
  extractCwdBasename,
  extractProject,
} from '../src/parser.js';
import { hashLine, floorToBucket, safeParseTime, formatNumber, bucketKey } from '../src/storage.js';

const TS = '2026-08-10T10:00:00Z';

describe('parser', () => {
  describe('parseClaudeCodeLine', () => {
    it('正常解析 assistant 消息', () => {
      const line = JSON.stringify({
        type: 'assistant',
        timestamp: TS,
        message: {
          model: 'claude-sonnet-4',
          role: 'assistant',
          usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 5, reasoning_output_tokens: 3 },
        },
      });
      const entry = parseClaudeCodeLine(line);
      expect(entry).not.toBeNull();
      expect(entry!.source).toBe('claude-code');
      expect(entry!.model).toBe('claude-sonnet-4');
      expect(entry!.usage.input_tokens).toBe(100);
      expect(entry!.usage.output_tokens).toBe(50);
      expect(entry!.usage.cached_input_tokens).toBe(10);
      expect(entry!.usage.cache_creation_input_tokens).toBe(5);
      expect(entry!.usage.reasoning_output_tokens).toBe(3);
      expect(entry!.timestamp).toBe(new Date(TS).toISOString());
    });

    it('非 assistant 类型返回 null', () => {
      const line = JSON.stringify({ type: 'user', timestamp: TS, message: { role: 'user' } });
      expect(parseClaudeCodeLine(line)).toBeNull();
    });

    it('缺少 usage 返回 null', () => {
      const line = JSON.stringify({ type: 'assistant', timestamp: TS, message: { model: 'm' } });
      expect(parseClaudeCodeLine(line)).toBeNull();
    });

    it('无效 JSON 返回 null', () => {
      expect(parseClaudeCodeLine('not json')).toBeNull();
    });
  });

  describe('parseCodexLine', () => {
    it('正常解析 usage 字段', () => {
      const line = JSON.stringify({
        timestamp: TS,
        model: 'gpt-4o',
        usage: { input_tokens: 200, output_tokens: 80, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, reasoning_output_tokens: 0 },
      });
      const entry = parseCodexLine(line);
      expect(entry).not.toBeNull();
      expect(entry!.source).toBe('codex');
      expect(entry!.model).toBe('gpt-4o');
      expect(entry!.usage.input_tokens).toBe(200);
      expect(entry!.usage.output_tokens).toBe(80);
    });

    it('兼容 token_usage / prompt_tokens / completion_tokens', () => {
      const line = JSON.stringify({
        created_at: TS,
        model: 'gpt-4',
        token_usage: { prompt_tokens: 300, completion_tokens: 100 },
      });
      const entry = parseCodexLine(line);
      expect(entry).not.toBeNull();
      expect(entry!.usage.input_tokens).toBe(300);
      expect(entry!.usage.output_tokens).toBe(100);
    });

    it('缺少 usage 返回 null', () => {
      const line = JSON.stringify({ timestamp: TS, model: 'gpt-4' });
      expect(parseCodexLine(line)).toBeNull();
    });

    it('无效时间戳返回 null', () => {
      const line = JSON.stringify({ timestamp: 'invalid', model: 'gpt-4', usage: { input_tokens: 1 } });
      expect(parseCodexLine(line)).toBeNull();
    });
  });

  describe('parseCursorLine', () => {
    it('正常解析', () => {
      const line = JSON.stringify({
        timestamp: TS,
        model: 'cursor-fast',
        usage: { input_tokens: 150, output_tokens: 60, cache_read_input_tokens: 5, cache_creation_input_tokens: 0, reasoning_output_tokens: 0 },
      });
      const entry = parseCursorLine(line);
      expect(entry).not.toBeNull();
      expect(entry!.source).toBe('cursor');
      expect(entry!.model).toBe('cursor-fast');
      expect(entry!.usage.input_tokens).toBe(150);
      expect(entry!.usage.cached_input_tokens).toBe(5);
    });

    it('缺少 usage 返回 null', () => {
      const line = JSON.stringify({ timestamp: TS, model: 'm' });
      expect(parseCursorLine(line)).toBeNull();
    });
  });

  describe('parseOpenCodeLine', () => {
    it('正常解析 assistant 消息', () => {
      const line = JSON.stringify({
        role: 'assistant',
        time: { created: TS },
        providerID: 'openai',
        modelID: 'gpt-4o',
        tokens: { input: 100, output: 40, reasoning: 10, cache: { read: 5, write: 2 } },
      });
      const entry = parseOpenCodeLine(line);
      expect(entry).not.toBeNull();
      expect(entry!.source).toBe('opencode');
      expect(entry!.model).toBe('openai/gpt-4o');
      expect(entry!.usage.input_tokens).toBe(100);
      expect(entry!.usage.output_tokens).toBe(40);
      expect(entry!.usage.reasoning_output_tokens).toBe(10);
      expect(entry!.usage.cached_input_tokens).toBe(5);
      expect(entry!.usage.cache_creation_input_tokens).toBe(2);
    });

    it('非 assistant 角色返回 null', () => {
      const line = JSON.stringify({ role: 'user', time: { created: TS }, tokens: { input: 10 } });
      expect(parseOpenCodeLine(line)).toBeNull();
    });

    it('缺少 tokens 返回 null', () => {
      const line = JSON.stringify({ role: 'assistant', time: { created: TS } });
      expect(parseOpenCodeLine(line)).toBeNull();
    });

    it('缺少 providerID/modelID 时 model 为 unknown', () => {
      const line = JSON.stringify({ role: 'assistant', time: { created: TS }, tokens: { input: 1, output: 1 } });
      const entry = parseOpenCodeLine(line);
      expect(entry!.model).toBe('unknown');
    });
  });

  describe('parseLine', () => {
    it('按 source 分发到对应解析器', () => {
      const claudeLine = JSON.stringify({ type: 'assistant', timestamp: TS, message: { model: 'm', usage: { input_tokens: 1 } } });
      expect(parseLine(claudeLine, 'claude-code')!.source).toBe('claude-code');

      const codexLine = JSON.stringify({ timestamp: TS, model: 'm', usage: { input_tokens: 1 } });
      expect(parseLine(codexLine, 'codex')!.source).toBe('codex');

      const cursorLine = JSON.stringify({ timestamp: TS, model: 'm', usage: { input_tokens: 1 } });
      expect(parseLine(cursorLine, 'cursor')!.source).toBe('cursor');

      const opencodeLine = JSON.stringify({ role: 'assistant', time: { created: TS }, tokens: { input: 1, output: 1 } });
      expect(parseLine(opencodeLine, 'opencode')!.source).toBe('opencode');
    });

    it('未知 source 返回 null', () => {
      expect(parseLine('{}', 'unknown-source')).toBeNull();
    });
  });

  describe('extractCwdBasename', () => {
    it('从日志行提取 cwd 的 basename', () => {
      const lines = [
        JSON.stringify({ type: 'user', cwd: '/Users/me/Projects/my-project' }),
      ];
      expect(extractCwdBasename(lines)).toBe('my-project');
    });

    it('多行时取第一个匹配', () => {
      const lines = [
        JSON.stringify({ type: 'user', cwd: '/first/proj-a' }),
        JSON.stringify({ type: 'user', cwd: '/second/proj-b' }),
      ];
      expect(extractCwdBasename(lines)).toBe('proj-a');
    });

    it('无 cwd 时返回 null', () => {
      expect(extractCwdBasename([JSON.stringify({ type: 'user' })])).toBeNull();
    });
  });

  describe('extractProject', () => {
    it('claude-code 优先从 cwd 提取', () => {
      const lines = [JSON.stringify({ cwd: '/home/user/work/cool-app' })];
      expect(extractProject('claude-code', '/some/path', lines)).toBe('cool-app');
    });

    it('claude-code 无 cwd 时回退到路径编码', () => {
      const lines = [JSON.stringify({ type: 'user' })];
      const path = '/home/user/.claude/projects/-my-encoded-project/session.jsonl';
      expect(extractProject('claude-code', path, lines)).toBe('project');
    });

    it('codex 始终返回 unknown', () => {
      expect(extractProject('codex', '/some/path', [JSON.stringify({ cwd: '/x/y/z' })])).toBe('unknown');
    });
  });
});

describe('storage utils', () => {
  describe('hashLine', () => {
    it('相同输入产生相同哈希', () => {
      expect(hashLine('hello world')).toBe(hashLine('hello world'));
    });

    it('不同输入产生不同哈希', () => {
      expect(hashLine('hello')).not.toBe(hashLine('world'));
    });

    it('空字符串也能哈希', () => {
      expect(typeof hashLine('')).toBe('string');
      expect(hashLine('').length).toBeGreaterThan(0);
    });
  });

  describe('floorToBucket', () => {
    it('向下取整到 30 分钟边界', () => {
      // 10:00:00 → 10:00 桶
      const ts = new Date('2026-08-10T10:00:00Z').getTime();
      expect(floorToBucket(ts)).toBe(ts);
      // 10:15:00 → 10:00 桶
      const ts2 = new Date('2026-08-10T10:15:00Z').getTime();
      expect(floorToBucket(ts2)).toBe(ts);
      // 10:30:00 → 10:30 桶
      const ts3 = new Date('2026-08-10T10:30:00Z').getTime();
      expect(floorToBucket(ts3)).toBe(ts3);
    });
  });

  describe('safeParseTime', () => {
    it('解析 ISO 字符串', () => {
      expect(safeParseTime('2026-08-10T10:00:00Z')).toBe(new Date('2026-08-10T10:00:00Z').getTime());
    });

    it('解析数字时间戳', () => {
      const ts = Date.now();
      expect(safeParseTime(ts)).toBe(ts);
    });

    it('无效字符串返回 null', () => {
      expect(safeParseTime('not-a-date')).toBeNull();
    });

    it('非字符串/数字返回 null', () => {
      expect(safeParseTime(null)).toBeNull();
      expect(safeParseTime(undefined)).toBeNull();
      expect(safeParseTime({})).toBeNull();
    });
  });

  describe('formatNumber', () => {
    it('小于 1000 原样输出', () => {
      expect(formatNumber(999)).toBe('999');
      expect(formatNumber(0)).toBe('0');
    });

    it('大于等于 1000 用 K', () => {
      expect(formatNumber(1500)).toBe('1.5K');
      expect(formatNumber(1000)).toBe('1.0K');
    });

    it('大于等于 1M 用 M', () => {
      expect(formatNumber(1_500_000)).toBe('1.50M');
    });
  });

  describe('bucketKey', () => {
    it('拼接各字段为唯一键', () => {
      expect(bucketKey(1000, 'claude-code', 'gpt-4', 'proj')).toBe('1000|claude-code|gpt-4|proj');
    });
  });
});
