import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/credentials.js', () => ({
  getAllKeys: vi.fn(),
  setKey: vi.fn(),
  unsetKey: vi.fn(),
  updateCredentials: vi.fn(async (mutator: (creds: Record<string, string>) => void) => {
    mutator({});
  }),
}));

import { getAllKeys, setKey, unsetKey, updateCredentials } from '../src/credentials.js';
import {
  loadConfig,
  loadAllConfigs,
  getFallbackCount,
  missingConfigHint,
  setPrimaryConfig,
  addFallbackConfig,
  removeFallbackConfig,
  deletePrimaryConfig,
  updateFallbackConfig,
  moveFallbackConfig,
} from '../src/multimodal-config.js';

describe('multimodal-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('所有配置齐全时返回 MultimodalConfig', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        'vision.base_url': 'https://api.openai.com/v1',
        'vision.model': 'gpt-4o',
        'vision': 'sk-test-key',
      });
      const config = await loadConfig();
      expect(config).toEqual({
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        apiKey: 'sk-test-key',
      });
    });

    it('缺少 base_url 时返回 null', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      expect(await loadConfig()).toBeNull();
    });

    it('缺少 model 时返回 null', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        'vision.base_url': 'https://api.openai.com/v1',
      });
      expect(await loadConfig()).toBeNull();
    });

    it('缺少 apiKey 时返回 null', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        'vision.base_url': 'https://api.openai.com/v1',
        'vision.model': 'gpt-4o',
      });
      expect(await loadConfig()).toBeNull();
    });
  });

  describe('loadAllConfigs', () => {
    it('仅主模型配置时返回单元素数组', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        'vision.base_url': 'https://api.openai.com/v1',
        'vision.model': 'gpt-4o',
        'vision': 'sk-primary',
      });
      const configs = await loadAllConfigs();
      expect(configs).toHaveLength(1);
      expect(configs[0]!.model).toBe('gpt-4o');
    });

    it('主模型 + 2 个备选模型时返回 3 个配置', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        'vision': 'sk-primary',
        'vision.base_url': 'https://api.primary.com/v1',
        'vision.model': 'primary-model',
        'vision.fallback.0': 'sk-fb0',
        'vision.fallback.0.base_url': 'https://api.fb0.com/v1',
        'vision.fallback.0.model': 'fb0-model',
        'vision.fallback.1': 'sk-fb1',
        'vision.fallback.1.base_url': 'https://api.fb1.com/v1',
        'vision.fallback.1.model': 'fb1-model',
      });
      const configs = await loadAllConfigs();
      expect(configs).toHaveLength(3);
      expect(configs[0]!.model).toBe('primary-model');
      expect(configs[1]!.model).toBe('fb0-model');
      expect(configs[2]!.model).toBe('fb1-model');
    });

    it('主模型未配置但备选存在时返回备选', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        'vision.fallback.0': 'sk-fb0',
        'vision.fallback.0.base_url': 'https://api.fb0.com/v1',
        'vision.fallback.0.model': 'fb0-model',
      });
      const configs = await loadAllConfigs();
      expect(configs).toHaveLength(1);
      expect(configs[0]!.model).toBe('fb0-model');
    });

    it('全部未配置时返回空数组', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      expect(await loadAllConfigs()).toEqual([]);
    });

    it('备选不连续时在第一个缺失处停止', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        'vision': 'sk-primary',
        'vision.base_url': 'https://api.primary.com/v1',
        'vision.model': 'primary-model',
        'vision.fallback.0': 'sk-fb0',
        'vision.fallback.0.base_url': 'https://api.fb0.com/v1',
        'vision.fallback.0.model': 'fb0-model',
        'vision.fallback.2': 'sk-fb2',
        'vision.fallback.2.base_url': 'https://api.fb2.com/v1',
        'vision.fallback.2.model': 'fb2-model',
      });
      const configs = await loadAllConfigs();
      expect(configs).toHaveLength(2);
      expect(configs[1]!.model).toBe('fb0-model');
    });
  });

  describe('getFallbackCount', () => {
    it('无备选时返回 0', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      expect(await getFallbackCount()).toBe(0);
    });

    it('有 2 个备选时返回 2', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        'vision': 'sk-primary',
        'vision.base_url': 'https://api.primary.com/v1',
        'vision.model': 'primary-model',
        'vision.fallback.0': 'sk-fb0',
        'vision.fallback.0.base_url': 'https://api.fb0.com/v1',
        'vision.fallback.0.model': 'fb0-model',
        'vision.fallback.1': 'sk-fb1',
        'vision.fallback.1.base_url': 'https://api.fb1.com/v1',
        'vision.fallback.1.model': 'fb1-model',
      });
      expect(await getFallbackCount()).toBe(2);
    });
  });

  describe('setPrimaryConfig', () => {
    it('仅设置 base_url', async () => {
      await setPrimaryConfig({ baseUrl: 'https://api.test.com/v1' });
      expect(updateCredentials).toHaveBeenCalledTimes(1);
    });

    it('仅设置 model', async () => {
      await setPrimaryConfig({ model: 'gpt-4o' });
      expect(updateCredentials).toHaveBeenCalledTimes(1);
    });

    it('同时设置 base_url 和 model', async () => {
      await setPrimaryConfig({ baseUrl: 'https://api.test.com/v1', model: 'gpt-4o' });
      expect(updateCredentials).toHaveBeenCalledTimes(1);
    });
  });

  describe('addFallbackConfig', () => {
    it('在第一个空位添加备选模型', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        'vision': 'sk-primary',
        'vision.base_url': 'https://api.primary.com/v1',
        'vision.model': 'primary-model',
      });
      const idx = await addFallbackConfig('https://api.fb.com/v1', 'fb-model');
      expect(idx).toBe(0);
      expect(updateCredentials).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeFallbackConfig', () => {
    it('不存在的索引返回 false', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      expect(await removeFallbackConfig(0)).toBe(false);
      expect(updateCredentials).not.toHaveBeenCalled();
    });

    it('存在的索引删除并返回 true', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        'vision': 'sk-primary',
        'vision.base_url': 'https://api.primary.com/v1',
        'vision.model': 'primary-model',
        'vision.fallback.0': 'sk-fb0',
        'vision.fallback.0.base_url': 'https://api.fb0.com/v1',
        'vision.fallback.0.model': 'fb0-model',
      });
      expect(await removeFallbackConfig(0)).toBe(true);
      expect(updateCredentials).toHaveBeenCalledTimes(1);
    });
  });

  describe('missingConfigHint', () => {
    it('包含 CLI 配置引导', () => {
      const hint = missingConfigHint();
      expect(hint).toContain('deepseek-plugin-cli auth set vision');
      expect(hint).toContain('deepseek-plugin-cli multimodal config');
      expect(hint).toContain('--base-url');
      expect(hint).toContain('--model');
    });
  });

  describe('deletePrimaryConfig', () => {
    it('删除主模型的三个 key', async () => {
      await deletePrimaryConfig();
      expect(updateCredentials).toHaveBeenCalledTimes(1);
      const mutator = vi.mocked(updateCredentials).mock.calls[0]![0];
      const creds: Record<string, string> = {
        'vision': 'sk',
        'vision.base_url': 'https://x',
        'vision.model': 'm',
      };
      mutator(creds);
      expect(creds).toEqual({});
    });
  });

  describe('updateFallbackConfig', () => {
    it('仅更新提供的字段', async () => {
      await updateFallbackConfig(0, { baseUrl: 'https://new.com/v1' });
      expect(updateCredentials).toHaveBeenCalledTimes(1);
      const mutator = vi.mocked(updateCredentials).mock.calls[0]![0];
      const creds: Record<string, string> = {
        'vision.fallback.0': 'sk-old',
        'vision.fallback.0.base_url': 'https://old.com/v1',
        'vision.fallback.0.model': 'old-model',
      };
      mutator(creds);
      expect(creds['vision.fallback.0.base_url']).toBe('https://new.com/v1');
      expect(creds['vision.fallback.0.model']).toBe('old-model');
      expect(creds['vision.fallback.0']).toBe('sk-old');
    });

    it('apiKey 为空字符串时删除该 key', async () => {
      await updateFallbackConfig(0, { apiKey: '' });
      expect(updateCredentials).toHaveBeenCalledTimes(1);
      const mutator = vi.mocked(updateCredentials).mock.calls[0]![0];
      const creds: Record<string, string> = {
        'vision.fallback.0': 'sk-old',
        'vision.fallback.0.base_url': 'https://x',
        'vision.fallback.0.model': 'm',
      };
      mutator(creds);
      expect(creds['vision.fallback.0']).toBeUndefined();
    });
  });

  describe('moveFallbackConfig', () => {
    it('越界索引返回 false', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      expect(await moveFallbackConfig(0, 1)).toBe(false);
      expect(updateCredentials).not.toHaveBeenCalled();
    });

    it('边界方向返回 false', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        'vision.fallback.0': 'sk',
        'vision.fallback.0.base_url': 'https://x',
        'vision.fallback.0.model': 'm',
      });
      // 第 0 个上移（dir=-1）越界
      expect(await moveFallbackConfig(0, -1)).toBe(false);
      expect(updateCredentials).not.toHaveBeenCalled();
    });

    it('正常交换相邻备选模型', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        'vision': 'sk-primary',
        'vision.base_url': 'https://primary',
        'vision.model': 'primary-model',
        'vision.fallback.0': 'sk0',
        'vision.fallback.0.base_url': 'https://0',
        'vision.fallback.0.model': 'm0',
        'vision.fallback.1': 'sk1',
        'vision.fallback.1.base_url': 'https://1',
        'vision.fallback.1.model': 'm1',
      });
      expect(await moveFallbackConfig(0, 1)).toBe(true);
      expect(updateCredentials).toHaveBeenCalledTimes(1);
      const mutator = vi.mocked(updateCredentials).mock.calls[0]![0];
      const creds: Record<string, string> = {
        'vision': 'sk-primary',
        'vision.base_url': 'https://primary',
        'vision.model': 'primary-model',
        'vision.fallback.0': 'sk0',
        'vision.fallback.0.base_url': 'https://0',
        'vision.fallback.0.model': 'm0',
        'vision.fallback.1': 'sk1',
        'vision.fallback.1.base_url': 'https://1',
        'vision.fallback.1.model': 'm1',
      };
      mutator(creds);
      // 交换后 fallback.0 和 fallback.1 的值互换
      expect(creds['vision.fallback.0']).toBe('sk1');
      expect(creds['vision.fallback.1']).toBe('sk0');
      expect(creds['vision.fallback.0.model']).toBe('m1');
      expect(creds['vision.fallback.1.model']).toBe('m0');
    });
  });
});
