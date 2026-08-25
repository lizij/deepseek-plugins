import type { TokenEntry } from './types.js';
import { safeParseTime } from './storage.js';

// ─── 项目名提取 ───

/** 从日志行中提取 cwd 字段的 basename 作为项目名；找不到返回 null。 */
export function extractCwdBasename(lines: string[]): string | null {
  for (const line of lines) {
    const m = line.match(/"cwd"\s*:\s*"([^"]+)"/);
    if (m && m[1]) {
      const base = m[1].split('/').filter(Boolean).pop();
      if (base) return base;
    }
  }
  return null;
}

/**
 * 解析 agent 日志对应的项目名。
 * claude-code/opencode 从日志行内嵌的 cwd 取 basename，找不到时回退到路径编码启发式。
 * deepseek-harness 优先取会话 header 的 cwd，失败时从路径 --<cwd>-- 目录名解码。
 */
export function extractProject(source: string, filePath: string, lines: string[]): string {
  if (source === 'claude-code' || source === 'opencode' || source === 'deepseek-harness') {
    const fromCwd = extractCwdBasename(lines);
    if (fromCwd) return fromCwd;
  }
  if (source === 'claude-code') {
    // 回退：~/.claude/projects/<encoded>/<session>.jsonl
    const parts = filePath.split('/');
    const idx = parts.lastIndexOf('projects');
    if (idx >= 0 && idx + 1 < parts.length) {
      const encoded = parts[idx + 1] ?? '';
      const decoded = encoded.replace(/^-/, '').split('-').filter(Boolean);
      return decoded[decoded.length - 1] || 'unknown';
    }
  }
  if (source === 'deepseek-harness') {
    // 回退：~/.dsh/sessions/--<cwd>--/<session-id>/session.jsonl[.zstd]
    const parts = filePath.split('/');
    const idx = parts.lastIndexOf('sessions');
    if (idx >= 0 && idx + 1 < parts.length) {
      const encoded = parts[idx + 1] ?? '';
      const decoded = encoded.replace(/^--/, '').split('-').filter(Boolean);
      return decoded[decoded.length - 1] || 'unknown';
    }
  }
  return 'unknown';
}

// ─── 解析器：从日志行提取 token 数据 ───

export function parseClaudeCodeLine(line: string): TokenEntry | null {
  try {
    const obj = JSON.parse(line);
    if (obj.type !== 'assistant') return null;
    const msg = obj.message;
    if (!msg || !msg.usage) return null;
    const usage = msg.usage;
    const ts = safeParseTime(obj.timestamp);
    if (ts === null) return null;
    return {
      timestamp: new Date(ts).toISOString(),
      source: 'claude-code',
      model: msg.model || 'unknown',
      project: 'unknown',
      usage: {
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        cached_input_tokens: usage.cache_read_input_tokens || 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
        reasoning_output_tokens: usage.reasoning_output_tokens || 0,
      },
    };
  } catch {
    return null;
  }
}

export function parseCodexLine(line: string): TokenEntry | null {
  try {
    const obj = JSON.parse(line);
    const usage = obj.usage || obj.token_usage;
    if (!usage) return null;
    const time = safeParseTime(obj.timestamp || obj.created_at || obj.time);
    if (time === null) return null;
    return {
      timestamp: new Date(time).toISOString(),
      source: 'codex',
      model: obj.model || 'unknown',
      project: 'unknown',
      usage: {
        input_tokens: usage.input_tokens || usage.prompt_tokens || 0,
        output_tokens: usage.output_tokens || usage.completion_tokens || 0,
        cached_input_tokens: usage.cache_read_input_tokens || 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
        reasoning_output_tokens: usage.reasoning_output_tokens || 0,
      },
    };
  } catch {
    return null;
  }
}

export function parseCursorLine(line: string): TokenEntry | null {
  try {
    const obj = JSON.parse(line);
    const usage = obj.usage;
    if (!usage) return null;
    const time = safeParseTime(obj.timestamp || obj.time);
    if (time === null) return null;
    return {
      timestamp: new Date(time).toISOString(),
      source: 'cursor',
      model: obj.model || 'unknown',
      project: 'unknown',
      usage: {
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        cached_input_tokens: usage.cache_read_input_tokens || 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
        reasoning_output_tokens: usage.reasoning_output_tokens || 0,
      },
    };
  } catch {
    return null;
  }
}

/** opencode assistant 消息：tokens 字段含 input/output/reasoning/cache.read/cache.write */
export function parseOpenCodeLine(line: string): TokenEntry | null {
  try {
    const obj = JSON.parse(line);
    if (obj.role !== 'assistant') return null;
    const tokens = obj.tokens;
    if (!tokens) return null;
    const ts = safeParseTime(obj.time?.created);
    if (ts === null) return null;
    const model = [obj.providerID, obj.modelID].filter(Boolean).join('/') || 'unknown';
    return {
      timestamp: new Date(ts).toISOString(),
      source: 'opencode',
      model,
      project: 'unknown',
      usage: {
        input_tokens: tokens.input || 0,
        output_tokens: tokens.output || 0,
        cached_input_tokens: tokens.cache?.read || 0,
        cache_creation_input_tokens: tokens.cache?.write || 0,
        reasoning_output_tokens: tokens.reasoning || 0,
      },
    };
  } catch {
    return null;
  }
}

/**
 * 解析单条 harness assistant/message 事件。usage 内嵌在 data.usage（驼峰字段），时间戳取顶层 time（毫秒）。
 * model 事件本身不含，需由调用方从 request/context 事件解析后传入；缺省回退到 unknown。
 */
export function parseDeepseekHarnessLine(line: string, model = 'unknown'): TokenEntry | null {
  try {
    const obj = JSON.parse(line);
    if (obj.type !== 'assistant/message') return null;
    const data = obj.data;
    if (!data || !data.usage) return null;
    const usage = data.usage;
    const ts = safeParseTime(obj.time);
    if (ts === null) return null;
    return {
      timestamp: new Date(ts).toISOString(),
      source: 'deepseek-harness',
      model,
      project: 'unknown',
      usage: {
        input_tokens: usage.inputTokens || 0,
        output_tokens: usage.outputTokens || 0,
        cached_input_tokens: usage.cacheReadTokens || 0,
        cache_creation_input_tokens: usage.cacheWriteTokens || 0,
        reasoning_output_tokens: usage.reasoningTokens || 0,
      },
    };
  } catch {
    return null;
  }
}

/**
 * 批量解析 harness 会话日志。顺序扫描全量 lines，从 request/context 事件累计最近一次的 model，
 * 仅对 startLine 及之后（增量新增段）的 assistant/message 事件产出条目。
 * 依据：harness 的 assistant/message 不含 model，模型记录在 request/context.data.model。
 */
export function parseDeepseekHarnessLines(lines: string[], startLine = 0): TokenEntry[] {
  let currentModel = 'unknown';
  const entries: TokenEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const o = obj as { type?: string; data?: Record<string, unknown> };
    if (o.type === 'request/context' && o.data && typeof o.data.model === 'string') {
      currentModel = o.data.model;
    } else if (i >= startLine && o.type === 'assistant/message') {
      const entry = parseDeepseekHarnessLine(line, currentModel);
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

export function parseLine(line: string, source: string): TokenEntry | null {
  switch (source) {
    case 'claude-code':
      return parseClaudeCodeLine(line);
    case 'codex':
      return parseCodexLine(line);
    case 'cursor':
      return parseCursorLine(line);
    case 'opencode':
      return parseOpenCodeLine(line);
    case 'deepseek-harness':
      return parseDeepseekHarnessLine(line);
    default:
      return null;
  }
}
