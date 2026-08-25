import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { zstdCompressSync } from 'node:zlib';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 在任何动态加载依赖 homedir() 的模块（scanner/storage）之前设置 HOME，
// 使 ~/.dsh 与 ~/.deepseek-plugins 都落在临时目录，避免污染真实环境。
const TEST_HOME = join(tmpdir(), `dsh-harness-test-${process.pid}`);
process.env.HOME = TEST_HOME;

// 模块级被测模块
import { scanZstdFrames, decompressZstd } from '../src/zstd.js';
import { parseDeepseekHarnessLine, parseDeepseekHarnessLines, parseLine, extractProject } from '../src/parser.js';
import { findHarnessLogs, readTargetLines, harnessSessionsRoot } from '../src/scanner.js';

const TS = Date.parse('2026-08-10T10:00:00Z');

/** 构造 harness 风格的 assistant/message 事件行 */
function assistantMessageLine(usage: Record<string, number>, offsets = 0): string {
  return JSON.stringify({
    type: 'assistant/message',
    seq: 100 + offsets,
    time: TS + offsets,
    data: {
      turn: 0,
      step: offsets,
      message: { role: 'assistant', model: 'opensource/deepseek_v4_flash_0731', content: [] },
      usage,
    },
  });
}

/** 把多行打包成"每批次一帧"的 zstd 流（模拟 harness 的 append-batch 帧布局） */
function multiFrameZstd(lines: string[]): Buffer {
  const parts: Buffer[] = [];
  for (const l of lines) {
    parts.push(zstdCompressSync(Buffer.from(l + '\n', 'utf-8')));
  }
  return Buffer.concat(parts);
}

describe('zstd 多帧解码', () => {
  it('scanZstdFrames 能逐帧切分 harness 多帧流', () => {
    const buf = multiFrameZstd(['line1', 'line2', 'line3']);
    const frames = scanZstdFrames(buf);
    expect(frames.length).toBe(3); // 每批次一帧，共 3 帧
    expect(frames[0].start).toBe(0);
    expect(frames[2].end).toBe(buf.length);
  });

  it('decompressZstd 逐帧解压并拼接出完整逻辑日志（单帧解压只会得到首帧）', () => {
    const frames = ['a', 'bb', 'ccc'].map((x) => zstdCompressSync(Buffer.from(x)));
    const buf = Buffer.concat(frames);
    // 关键：单次 zstdDecompressSync 只能解出第一帧（用 zstd 包验证），我们的实现须拼全
    const text = decompressZstd(buf);
    expect(text).toBe('abbccc');
  });

  it('容忍尾部不完整帧（写了一半的追加批次），只解出完整帧', () => {
    const f1 = zstdCompressSync(Buffer.from('hello'));
    const buf = Buffer.concat([f1, Buffer.from([0x28, 0xb5, 0x2f])]); // 截断的帧 magic
    expect(decompressZstd(buf)).toBe('hello');
  });

  it('非 zstd 输入返回 null（不解压失败崩溃）', () => {
    expect(decompressZstd(Buffer.from('not zstd at all'))).toBeNull();
  });
});

describe('parseDeepseekHarnessLine', () => {
  it('正常解析 assistant/message 的 data.usage（驼峰→下划线映射，model 由调用方传入）', () => {
    const line = assistantMessageLine({ inputTokens: 24000, outputTokens: 150, cacheReadTokens: 20000, cacheWriteTokens: 100, reasoningTokens: 30 });
    const entry = parseDeepseekHarnessLine(line, 'opensource/deepseek_v4_flash_0731');
    expect(entry).not.toBeNull();
    expect(entry!.source).toBe('deepseek-harness');
    expect(entry!.model).toBe('opensource/deepseek_v4_flash_0731');
    expect(entry!.timestamp).toBe(new Date(TS).toISOString());
    expect(entry!.usage.input_tokens).toBe(24000);
    expect(entry!.usage.output_tokens).toBe(150);
    expect(entry!.usage.cached_input_tokens).toBe(20000);
    expect(entry!.usage.cache_creation_input_tokens).toBe(100);
    expect(entry!.usage.reasoning_output_tokens).toBe(30);
  });

  it('未传 model 时回退为 unknown', () => {
    const line = assistantMessageLine({ inputTokens: 1, outputTokens: 1 });
    expect(parseDeepseekHarnessLine(line)!.model).toBe('unknown');
  });

  it('缺省字段默认 0（cache/reasoning 可选）', () => {
    const line = assistantMessageLine({ inputTokens: 10, outputTokens: 5 });
    const entry = parseDeepseekHarnessLine(line);
    expect(entry!.usage.cached_input_tokens).toBe(0);
    expect(entry!.usage.cache_creation_input_tokens).toBe(0);
    expect(entry!.usage.reasoning_output_tokens).toBe(0);
  });

  it('非 assistant/message 返回 null', () => {
    const line = JSON.stringify({ type: 'user/message', seq: 1, time: TS, data: {} });
    expect(parseDeepseekHarnessLine(line)).toBeNull();
  });

  it('缺少 data.usage 返回 null', () => {
    const line = JSON.stringify({ type: 'assistant/message', seq: 1, time: TS, data: { message: { role: 'assistant' } } });
    expect(parseDeepseekHarnessLine(line)).toBeNull();
  });

  it('无效时间戳返回 null', () => {
    const line = JSON.stringify({ type: 'assistant/message', seq: 1, time: 'not-a-date', data: { usage: { inputTokens: 1 } } });
    expect(parseDeepseekHarnessLine(line)).toBeNull();
  });

  it('无效 JSON 返回 null', () => {
    expect(parseDeepseekHarnessLine('not json at all')).toBeNull();
  });

  it('parseLine 按 source 分发到 harness 解析器', () => {
    const line = assistantMessageLine({ inputTokens: 1, outputTokens: 1 });
    expect(parseLine(line, 'deepseek-harness')!.source).toBe('deepseek-harness');
  });
});

describe('parseDeepseekHarnessLines（模型解析 + 增量段）', () => {
  const MODEL = 'opensource/deepseek_v4_flash_0731';

  function requestContextLine(model: string): string {
    return JSON.stringify({ type: 'request/context', seq: 1, time: TS, data: { provider: 'relay', model, contextWindow: 1048576 } });
  }

  it('从 request/context 事件解析出最近一次 model', () => {
    const lines = [
      requestContextLine(MODEL),
      assistantMessageLine({ inputTokens: 100, outputTokens: 50 }, 0),
      assistantMessageLine({ inputTokens: 200, outputTokens: 80 }, 1),
    ];
    const entries = parseDeepseekHarnessLines(lines);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.model === MODEL)).toBe(true);
  });

  it('无 request/context 时 model 为 unknown', () => {
    const lines = [
      assistantMessageLine({ inputTokens: 10, outputTokens: 5 }, 0),
      assistantMessageLine({ inputTokens: 20, outputTokens: 8 }, 1),
    ];
    expect(parseDeepseekHarnessLines(lines).every((e) => e.model === 'unknown')).toBe(true);
  });

  it('仅返回 startLine 起（增量段）的条目，但 model 沿用此前 request/context', () => {
    const lines = [
      requestContextLine(MODEL),
      assistantMessageLine({ inputTokens: 100, outputTokens: 50 }, 0), // 已处理前缀
      assistantMessageLine({ inputTokens: 300, outputTokens: 120 }, 1), // 新增
      assistantMessageLine({ inputTokens: 400, outputTokens: 160 }, 2), // 新增
    ];
    const entries = parseDeepseekHarnessLines(lines, 2); // 从第 2 行（第 3 行）起
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.model === MODEL)).toBe(true);
    expect(entries.map((e) => e.usage.input_tokens)).toEqual([300, 400]);
  });
});

describe('extractProject (deepseek-harness)', () => {
  it('优先从会话 header 的 cwd 提取项目名', () => {
    const lines = [JSON.stringify({ type: 'session', cwd: '/Users/me/Projects/my-app' })];
    const project = extractProject('deepseek-harness', '/x/session.jsonl.zstd', lines);
    expect(project).toBe('my-app');
  });

  it('无 cwd 时从路径 --<cwd>-- 目录名回退提取（连字符编码有损，取末段）', () => {
    const path = '/Users/me/.dsh/sessions/--Users-me-Projects-my-app--/session-abc/session.jsonl.zstd';
    // 目录名 --Users-me-Projects-my-app-- 是将 cwd 按路径分隔符连写后的有损编码，无法还原真实 basename，仅回退取末段
    expect(extractProject('deepseek-harness', path, [])).toBe('app');
  });

  it('无法识别时返回 unknown', () => {
    expect(extractProject('deepseek-harness', '/some/other/path', [])).toBe('unknown');
  });
});

describe('deepseek-harness 端到端扫描', () => {
  const HAR_DIR = join(TEST_HOME, '.dsh', 'sessions', '--Users-me-Projects-my-app--');
  const SESSION_DIR = join(HAR_DIR, 'session-abc');

  beforeAll(() => {
    rmSync(TEST_HOME, { recursive: true, force: true });
    mkdirSync(SESSION_DIR, { recursive: true });
    writeFileSync(
      join(SESSION_DIR, 'session.jsonl.zstd'),
      multiFrameZstd([
        JSON.stringify({ type: 'session', id: 'session-abc', cwd: '/Users/me/Projects/my-app' }),
        assistantMessageLine({ inputTokens: 1000, outputTokens: 500 }, 0),
        assistantMessageLine({ inputTokens: 2000, outputTokens: 800 }, 1),
      ])
    );
  });

  it('harnessSessionsRoot 指向 ~/.dsh/sessions', () => {
    expect(harnessSessionsRoot()).toBe(join(TEST_HOME, '.dsh', 'sessions'));
  });

  it('findHarnessLogs 发现 zstd 会话日志', async () => {
    const targets = await findHarnessLogs();
    expect(targets.length).toBe(1);
    expect(targets[0].source).toBe('deepseek-harness');
    expect(targets[0].path).toBe(join(SESSION_DIR, 'session.jsonl.zstd'));
  });

  it('readTargetLines 解压 zstd 并返回逻辑行', async () => {
    const targets = await findHarnessLogs();
    const lines = await readTargetLines(targets[0]);
    expect(lines.length).toBe(3);
    expect(JSON.parse(lines[0]).type).toBe('session');
  });
});

describe('deepseek-harness 全流程聚合（scanAndAggregate + 增量）', () => {
  let counter: typeof import('../src/counter.js');

  /** 写入一个 harness 会话（含 session header + 若干 assistant/message） */
  function writeSession(usages: number[][]) {
    const dir = join(TEST_HOME, '.dsh', 'sessions', '--Users-me-Projects-def-app--', 'session-aggr');
    mkdirSync(dir, { recursive: true });
    const now = Date.now();
    const lines: string[] = [
      JSON.stringify({ type: 'session', id: 'session-aggr', cwd: '/Users/me/Projects/def-app' }),
    ];
    usages.forEach(([inp, out], i) => {
      lines.push(assistantMsg(inp, out, now + i));
    });
    writeFileSync(join(dir, 'session.jsonl.zstd'), multiFrameZstd(lines));
  }

  /** 追加一条 usage 作为新 frame 到既有 zstd 文件（模拟 harness 的新 append 批次，旧行保持字节不变） */
  function appendUsage(inp: number, out: number) {
    const file = join(TEST_HOME, '.dsh', 'sessions', '--Users-me-Projects-def-app--', 'session-aggr', 'session.jsonl.zstd');
    const dir = join(TEST_HOME, '.dsh', 'sessions', '--Users-me-Projects-def-app--', 'session-aggr');
    mkdirSync(dir, { recursive: true });
    const existing = existsSync(file) ? readFileSync(file) : Buffer.alloc(0);
    const frame = zstdCompressSync(Buffer.from(assistantMsg(inp, out, Date.now()) + '\n', 'utf-8'));
    writeFileSync(file, Buffer.concat([existing, frame]));
  }

  function assistantMsg(inp: number, out: number, time: number): string {
    return JSON.stringify({
      type: 'assistant/message',
      seq: time,
      time,
      data: { turn: 0, step: 0, message: { role: 'assistant', model: 'm1', content: [] }, usage: { inputTokens: inp, outputTokens: out } },
    });
  }

  beforeAll(async () => {
    // 强制重置模块缓存，使 counter.js 的 DATA_DIR 用当前 HOME 重新求值（避免跨文件共享的旧实例指向真实目录）
    vi.resetModules();
    rmSync(TEST_HOME, { recursive: true, force: true });
    counter = (await import('../src/counter.js')) as typeof import('../src/counter.js');
  });

  it('scanAndAggregate 应扫描 harness zstd 日志并聚合到桶（项目名取自 header cwd）', async () => {
    writeSession([[1000, 500], [2000, 800]]);
    const result = await counter.scanAndAggregate();
    expect(result.sources).toContain('deepseek-harness');
    expect(result.new_entries).toBe(2);

    const buckets = counter.getBuckets();
    const bucket = buckets.find((b) => b.source === 'deepseek-harness');
    expect(bucket).toBeDefined();
    expect(bucket!.project).toBe('def-app');
    expect(bucket!.input_tokens).toBe(3000);
    expect(bucket!.output_tokens).toBe(1300);
    expect(bucket!.total_tokens).toBe(4300);
    expect(bucket!.rounds).toBe(2);
  });

  it('增量扫描追加批次不应重复计数', async () => {
    // 追加一条 usage（模拟新 append 批次，写入新帧，旧行字节不变）
    appendUsage(500, 100);
    const result = await counter.scanAndAggregate();
    expect(result.new_entries).toBe(1);

    const bucket = counter.getBuckets().find((b) => b.source === 'deepseek-harness');
    expect(bucket!.input_tokens).toBe(3500);
    expect(bucket!.rounds).toBe(3);
  });

  it('clearAll 应清空 harness 聚合数据', () => {
    counter.clearAll();
    expect(counter.getBuckets().find((b) => b.source === 'deepseek-harness')).toBeUndefined();
  });
});