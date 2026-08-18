import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/credentials.js', () => ({
  getAllKeys: vi.fn(),
  setKey: vi.fn(),
  unsetKey: vi.fn(),
  updateCredentials: vi.fn(async (mutator: (creds: Record<string, string>) => void) => {
    mutator({});
  }),
}));

import { getAllKeys, updateCredentials } from '../src/credentials.js';
import {
  loadAllSources,
  getSource,
  addSource,
  updateSource,
  removeSource,
  moveSource,
} from '../src/sources.js';

const STORAGE_KEY = 'sources';

function sourcesJson(sources: Array<Record<string, unknown>>): string {
  return JSON.stringify(sources);
}

describe('sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadAllSources', () => {
    it('返回所有来源配置', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: sourcesJson([
          { id: 'deepseek', name: 'DeepSeek', type: 'deepseek', api_key: 'sk-1', features: ['balance', 'models'] },
          { id: 'openrouter', name: 'OpenRouter', type: 'openrouter', api_key: 'sk-2', features: ['balance', 'models'] },
        ]),
      });
      const sources = await loadAllSources();
      expect(sources).toHaveLength(2);
      expect(sources[0]!.id).toBe('deepseek');
      expect(sources[0]!.type).toBe('deepseek');
      expect(sources[0]!.apiKey).toBe('sk-1');
      expect(sources[0]!.features).toEqual(['balance', 'models']);
    });

    it('无配置时返回空数组', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      expect(await loadAllSources()).toEqual([]);
    });

    it('自动迁移旧的 deepseek service key', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({ deepseek: 'sk-old-key' });
      const sources = await loadAllSources();
      expect(sources).toHaveLength(1);
      expect(sources[0]!.id).toBe('deepseek');
      expect(sources[0]!.type).toBe('deepseek');
      expect(sources[0]!.apiKey).toBe('sk-old-key');
      expect(sources[0]!.features).toContain('balance');
    });
  });

  describe('getSource', () => {
    it('返回指定来源', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: sourcesJson([
          { id: 'deepseek', name: 'DeepSeek', type: 'deepseek', api_key: 'sk-1', features: ['balance'] },
        ]),
      });
      const s = await getSource('deepseek');
      expect(s).not.toBeNull();
      expect(s!.id).toBe('deepseek');
    });

    it('来源不存在时返回 null', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      expect(await getSource('nonexistent')).toBeNull();
    });
  });

  describe('addSource', () => {
    it('成功添加来源', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      await addSource('deepseek', 'deepseek', { apiKey: 'sk-1' });
      expect(updateCredentials).toHaveBeenCalled();
    });

    it('id 重复时抛出错误', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: sourcesJson([
          { id: 'deepseek', name: 'DeepSeek', type: 'deepseek', api_key: 'sk-1', features: ['balance'] },
        ]),
      });
      await expect(addSource('deepseek', 'deepseek', { apiKey: 'sk-2' })).rejects.toThrow('已存在');
    });

    it('不支持的供应商类型抛出错误', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      await expect(addSource('test', 'unknown-provider' as any, { apiKey: 'sk-1' })).rejects.toThrow('不支持的供应商');
    });

    it('features 不是供应商 supportedFeatures 子集时抛出错误', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      await expect(
        addSource('deepseek', 'deepseek', { apiKey: 'sk-1', features: ['usage' as any] }),
      ).rejects.toThrow('不支持功能');
    });

    it('id 为空时抛出错误', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      await expect(addSource('', 'deepseek', { apiKey: 'sk-1' })).rejects.toThrow('id 不能为空');
    });
  });

  describe('updateSource', () => {
    it('成功更新来源', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: sourcesJson([
          { id: 'deepseek', name: 'DeepSeek', type: 'deepseek', api_key: 'sk-1', features: ['balance', 'models'] },
        ]),
      });
      await updateSource('deepseek', { name: 'DeepSeek 官方' });
      expect(updateCredentials).toHaveBeenCalled();
    });

    it('来源不存在时抛出错误', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      await expect(updateSource('nonexistent', { name: 'test' })).rejects.toThrow('不存在');
    });

    it('更新 features 时校验是否为供应商 supportedFeatures 子集', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: sourcesJson([
          { id: 'deepseek', name: 'DeepSeek', type: 'deepseek', api_key: 'sk-1', features: ['balance', 'models'] },
        ]),
      });
      await expect(
        updateSource('deepseek', { features: ['usage' as any] }),
      ).rejects.toThrow('不支持功能');
    });
  });

  describe('removeSource', () => {
    it('成功删除来源', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: sourcesJson([
          { id: 'deepseek', name: 'DeepSeek', type: 'deepseek', api_key: 'sk-1', features: ['balance'] },
        ]),
      });
      const ok = await removeSource('deepseek');
      expect(ok).toBe(true);
    });

    it('来源不存在时返回 false', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      expect(await removeSource('nonexistent')).toBe(false);
    });
  });

  describe('moveSource', () => {
    it('成功上移', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: sourcesJson([
          { id: 'a', name: 'A', type: 'deepseek', api_key: 'sk-1', features: ['balance'] },
          { id: 'b', name: 'B', type: 'openrouter', api_key: 'sk-2', features: ['balance'] },
        ]),
      });
      const ok = await moveSource('b', -1);
      expect(ok).toBe(true);
    });

    it('越界时返回 false', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: sourcesJson([
          { id: 'a', name: 'A', type: 'deepseek', api_key: 'sk-1', features: ['balance'] },
        ]),
      });
      expect(await moveSource('a', -1)).toBe(false);
    });

    it('来源不存在时返回 false', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      expect(await moveSource('nonexistent', 1)).toBe(false);
    });
  });
});
