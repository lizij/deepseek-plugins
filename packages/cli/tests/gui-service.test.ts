import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { EventEmitter } from 'node:events';

// Mock HTML 导入（vitest 无法直接处理 .html 文件）
vi.mock('../src/gui/index.html', () => ({ default: '<html>mock</html>' }));

// Mock 外部依赖
vi.mock('@deepseek-plugins/shared', () => ({
  getAllKeys: vi.fn(),
  getKey: vi.fn(),
  setKey: vi.fn(),
}));

vi.mock('@deepseek-plugins/shared/balance', () => ({
  fetchBalance: vi.fn(),
  fetchBalanceForSource: vi.fn(),
  fetchAllBalances: vi.fn(),
}));

vi.mock('@deepseek-plugins/shared/usage', () => ({
  fetchUsageForSource: vi.fn(),
  fetchAllUsages: vi.fn(),
}));

vi.mock('@deepseek-plugins/shared/models', () => ({
  fetchModelsForSource: vi.fn(),
  fetchAllModels: vi.fn(),
}));

vi.mock('@deepseek-plugins/shared/sources', () => ({
  loadAllSources: vi.fn(),
  getSource: vi.fn(),
  addSource: vi.fn(),
  updateSource: vi.fn(),
  removeSource: vi.fn(),
  moveSource: vi.fn(),
}));

vi.mock('@deepseek-plugins/shared/providers', () => ({
  listProviders: vi.fn(),
  isProviderSupported: vi.fn(),
}));

vi.mock('@deepseek-plugins/shared/multimodal-config', () => ({
  loadAllModels: vi.fn(),
  setModel: vi.fn(),
  addModel: vi.fn(),
  removeModel: vi.fn(),
  updateModel: vi.fn(),
  moveModel: vi.fn(),
}));

vi.mock('@deepseek-plugins/token-counter', () => ({
  scanAndAggregate: vi.fn(),
  getSummary: vi.fn(),
  getBuckets: vi.fn(),
  generateDailyReport: vi.fn(),
}));

import { getAllKeys, getKey, setKey } from '@deepseek-plugins/shared';
import { fetchBalance, fetchAllBalances } from '@deepseek-plugins/shared/balance';
import { loadAllSources, getSource, addSource, updateSource, removeSource, moveSource } from '@deepseek-plugins/shared/sources';
import { listProviders, isProviderSupported } from '@deepseek-plugins/shared/providers';
import { loadAllModels, addModel, setModel, updateModel, removeModel, moveModel } from '@deepseek-plugins/shared/multimodal-config';
import { scanAndAggregate, getSummary, getBuckets, generateDailyReport } from '@deepseek-plugins/token-counter';
import { toModelEntries } from '../src/gui/model-adapter.js';
import { isProcessAlive } from '../src/gui/singleton.js';
import { readBody } from '../src/gui/http-utils.js';
import { startService } from '../src/gui/server.js';

describe('gui/model-adapter', () => {
  describe('toModelEntries', () => {
    it('空数组返回空数组', () => {
      expect(toModelEntries([])).toEqual([]);
    });

    it('元素 index 为数组下标', () => {
      const configs = [
        { baseUrl: 'https://api.primary.com/v1', model: 'primary-model', apiKey: 'sk-primary' },
      ];
      const entries = toModelEntries(configs);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.index).toBe(0);
      expect(entries[0]!.baseUrl).toBe('https://api.primary.com/v1');
      expect(entries[0]!.model).toBe('primary-model');
      expect(entries[0]!.apiKey).toBe('sk-primary');
    });

    it('多个元素 index 从 0 递增', () => {
      const configs = [
        { baseUrl: 'https://p.com/v1', model: 'p', apiKey: 'sk-p' },
        { baseUrl: 'https://f0.com/v1', model: 'f0', apiKey: 'sk-f0' },
        { baseUrl: 'https://f1.com/v1', model: 'f1', apiKey: 'sk-f1' },
      ];
      const entries = toModelEntries(configs);
      expect(entries[0]!.index).toBe(0);
      expect(entries[1]!.index).toBe(1);
      expect(entries[2]!.index).toBe(2);
    });
  });
});

describe('gui/singleton', () => {
  describe('isProcessAlive', () => {
    it('当前进程应存活', () => {
      expect(isProcessAlive(process.pid)).toBe(true);
    });

    it('无效 PID 返回 false', () => {
      expect(isProcessAlive(0)).toBe(false);
      expect(isProcessAlive(-1)).toBe(false);
    });

    it('不存在的 PID 返回 false', () => {
      // 使用一个大概率不存在的 PID
      expect(isProcessAlive(99999)).toBe(false);
    });
  });
});

describe('gui/http-utils', () => {
  describe('readBody', () => {
    function mockReq(body: string): IncomingMessage {
      const req = new EventEmitter() as unknown as IncomingMessage;
      // 模拟 data 事件
      setImmediate(() => {
        req.emit('data', Buffer.from(body));
        req.emit('end');
      });
      return req;
    }

    it('正常解析 JSON body', async () => {
      const req = mockReq(JSON.stringify({ apiKey: 'sk-test' }));
      const result = await readBody(req);
      expect(result).toEqual({ apiKey: 'sk-test' });
    });

    it('空 body 返回空对象', async () => {
      const req = mockReq('');
      const result = await readBody(req);
      expect(result).toEqual({});
    });

    it('无效 JSON 抛出错误', async () => {
      const req = mockReq('not-json');
      await expect(readBody(req)).rejects.toThrow();
    });

    it('超大 body 抛出错误', async () => {
      const req = new EventEmitter() as unknown as IncomingMessage;
      (req as any).destroy = vi.fn();
      const bigChunk = Buffer.alloc(1024 * 1024 + 1, 'x');
      setImmediate(() => {
        req.emit('data', bigChunk);
      });
      await expect(readBody(req)).rejects.toThrow('请求体过大');
    });
  });
});

describe('gui/server (HTTP routes)', () => {
  let port: number;
  let server: { close: () => Promise<void> };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadAllSources).mockResolvedValue([]);
    vi.mocked(listProviders).mockResolvedValue([]);
    vi.mocked(isProviderSupported).mockReturnValue(false);
  });

  beforeAll(async () => {
    port = await startService();
  });

  afterAll(() => {
    // 服务器由 startService 内部创建，进程退出时自动关闭
  });

  async function request(path: string, options: RequestInit = {}): Promise<{ status: number; body: any }> {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    const text = await res.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
  }

  it('GET /health 返回 ok', async () => {
    const { status, body } = await request('/health');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.pid).toBe(process.pid);
  });

  it('GET / 返回 HTML', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('GET /api/config 返回配置', async () => {
    vi.mocked(getAllKeys).mockResolvedValue({ deepseek: 'sk-test' });
    vi.mocked(loadAllModels).mockResolvedValue([
      { baseUrl: 'https://p.com/v1', model: 'gpt-4o', apiKey: 'sk-p' },
    ]);
    const { status, body } = await request('/api/config');
    expect(status).toBe(200);
    expect(body.deepseekKeySet).toBe(true);
    expect(body.models).toHaveLength(1);
    expect(body.models[0].index).toBe(0);
  });

  it('GET /api/deepseek-key 返回 key', async () => {
    vi.mocked(getKey).mockResolvedValue('sk-deepseek');
    const { status, body } = await request('/api/deepseek-key');
    expect(status).toBe(200);
    expect(body.apiKey).toBe('sk-deepseek');
  });

  it('PUT /api/deepseek-key 设置 key', async () => {
    vi.mocked(setKey).mockResolvedValue(undefined);
    const { status } = await request('/api/deepseek-key', {
      method: 'PUT',
      body: JSON.stringify({ apiKey: 'new-key' }),
    });
    expect(status).toBe(200);
    expect(setKey).toHaveBeenCalledWith('deepseek', 'new-key');
  });

  it('PUT /api/deepseek-key 空 key 报错', async () => {
    const { status, body } = await request('/api/deepseek-key', {
      method: 'PUT',
      body: JSON.stringify({ apiKey: '' }),
    });
    expect(status).toBe(400);
    expect(body.error).toContain('apiKey 不能为空');
  });

  it('POST /api/models 新增模型', async () => {
    vi.mocked(addModel).mockResolvedValue(0);
    const { status, body } = await request('/api/models', {
      method: 'POST',
      body: JSON.stringify({ baseUrl: 'https://f.com/v1', model: 'fb-model', apiKey: 'sk-fb' }),
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.index).toBe(0);
    expect(addModel).toHaveBeenCalledWith('https://f.com/v1', 'fb-model', 'sk-fb');
  });

  it('POST /api/models 缺少必填字段报错', async () => {
    const { status, body } = await request('/api/models', {
      method: 'POST',
      body: JSON.stringify({ baseUrl: 'https://f.com/v1' }),
    });
    expect(status).toBe(400);
    expect(body.error).toContain('base_url / model / apiKey 均为必填');
  });

  it('GET /api/token/summary 返回汇总', async () => {
    vi.mocked(scanAndAggregate).mockResolvedValue({ scanned: 0, new_entries: 0, total_buckets: 0, sources: [] });
    vi.mocked(getSummary).mockReturnValue({
      today: 100, today_input: 60, today_output: 40, today_cached: 0,
      today_cache_creation: 0, today_reasoning: 0, seven_day: 100, all_time: 100,
      updated_at: '2026-01-01T00:00:00Z', by_source: [], by_model: [],
    });
    const { status, body } = await request('/api/token/summary');
    expect(status).toBe(200);
    expect(body.today).toBe(100);
  });

  it('GET /api/token/buckets 返回桶数据', async () => {
    vi.mocked(getBuckets).mockReturnValue([
      { bucket_start: '2026-01-01T00:00:00Z', source: 'claude-code', model: 'gpt-4', project: 'test', input_tokens: 10, output_tokens: 5, cached_input_tokens: 0, cache_creation_input_tokens: 0, reasoning_output_tokens: 0, total_tokens: 15, rounds: 1 },
    ]);
    const { status, body } = await request('/api/token/buckets?limit=10');
    expect(status).toBe(200);
    expect(body.buckets).toHaveLength(1);
  });

  it('GET /api/token/report 返回报告', async () => {
    vi.mocked(generateDailyReport).mockReturnValue([
      { date: '2026-01-01', rounds: 1, input_tokens: 10, output_tokens: 5, cached_input_tokens: 0, cache_creation_input_tokens: 0, reasoning_output_tokens: 0, total_tokens: 15 },
    ]);
    const { status, body } = await request('/api/token/report?days=7');
    expect(status).toBe(200);
    expect(body.report).toHaveLength(1);
  });

  it('POST /api/token/scan 触发扫描', async () => {
    vi.mocked(scanAndAggregate).mockResolvedValue({ scanned: 1, new_entries: 2, total_buckets: 3, sources: ['claude-code'] });
    const { status, body } = await request('/api/token/scan', { method: 'POST' });
    expect(status).toBe(200);
    expect(body.new_entries).toBe(2);
  });

  it('GET /api/balance 返回余额', async () => {
    vi.mocked(fetchAllBalances).mockResolvedValue([
      { source: { id: 'deepseek', name: 'DeepSeek', type: 'deepseek' }, result: { isAvailable: true, balances: [] }, error: undefined },
    ]);
    const { status, body } = await request('/api/balance');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].result.isAvailable).toBe(true);
  });

  it('未知路径返回 404', async () => {
    const { status } = await request('/api/nonexistent');
    expect(status).toBe(404);
  });

  it('PUT /api/models/0 更新模型', async () => {
    vi.mocked(loadAllModels).mockResolvedValue([
      { baseUrl: 'https://p.com/v1', model: 'gpt-4o', apiKey: 'sk-p' },
    ]);
    vi.mocked(updateModel).mockResolvedValue(undefined);
    const { status } = await request('/api/models/0', {
      method: 'PUT',
      body: JSON.stringify({ model: 'gpt-4o-mini' }),
    });
    expect(status).toBe(200);
    expect(updateModel).toHaveBeenCalledWith(0, { model: 'gpt-4o-mini' });
  });

  it('DELETE /api/models/0 删除模型', async () => {
    vi.mocked(loadAllModels).mockResolvedValue([
      { baseUrl: 'https://p.com/v1', model: 'gpt-4o', apiKey: 'sk-p' },
    ]);
    vi.mocked(removeModel).mockResolvedValue(true);
    const { status } = await request('/api/models/0', { method: 'DELETE' });
    expect(status).toBe(200);
    expect(removeModel).toHaveBeenCalledWith(0);
  });

  it('DELETE /api/models/1 删除模型', async () => {
    vi.mocked(loadAllModels).mockResolvedValue([
      { baseUrl: 'https://p.com/v1', model: 'gpt-4o', apiKey: 'sk-p' },
      { baseUrl: 'https://f.com/v1', model: 'fb', apiKey: 'sk-f' },
    ]);
    vi.mocked(removeModel).mockResolvedValue(true);
    const { status } = await request('/api/models/1', { method: 'DELETE' });
    expect(status).toBe(200);
    expect(removeModel).toHaveBeenCalledWith(1);
  });

  it('POST /api/models/1/move 移动模型', async () => {
    vi.mocked(moveModel).mockResolvedValue(true);
    const { status } = await request('/api/models/1/move', {
      method: 'POST',
      body: JSON.stringify({ dir: -1 }),
    });
    expect(status).toBe(200);
    expect(moveModel).toHaveBeenCalledWith(1, -1);
  });

  it('POST /api/models/1/move 无效 dir 报错', async () => {
    const { status, body } = await request('/api/models/1/move', {
      method: 'POST',
      body: JSON.stringify({ dir: 2 }),
    });
    expect(status).toBe(400);
    expect(body.error).toContain('dir 仅支持');
  });
});
