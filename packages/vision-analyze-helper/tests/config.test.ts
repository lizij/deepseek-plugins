import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig, loadAllConfigs, getFallbackCount, missingConfigHint } from '../src/config.js';

// Mock @deepseek-plugins/shared
vi.mock('@deepseek-plugins/shared', () => ({
  getKey: vi.fn(),
}));

import { getKey } from '@deepseek-plugins/shared';

describe('config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('所有配置齐全时返回 VisionConfig', async () => {
      vi.mocked(getKey).mockImplementation(async (svc: string) => {
        if (svc === 'vision.base_url') return 'https://api.openai.com/v1';
        if (svc === 'vision.model') return 'gpt-4o';
        if (svc === 'vision') return 'sk-test-key';
        return null;
      });
      const config = await loadConfig();
      expect(config).toEqual({
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        apiKey: 'sk-test-key',
      });
    });

    it('缺少 base_url 时返回 null', async () => {
      vi.mocked(getKey).mockResolvedValue(null);
      const config = await loadConfig();
      expect(config).toBeNull();
    });

    it('缺少 model 时返回 null', async () => {
      vi.mocked(getKey).mockImplementation(async (svc: string) => {
        if (svc === 'vision.base_url') return 'https://api.openai.com/v1';
        return null;
      });
      const config = await loadConfig();
      expect(config).toBeNull();
    });

    it('缺少 apiKey 时返回 null', async () => {
      vi.mocked(getKey).mockImplementation(async (svc: string) => {
        if (svc === 'vision.base_url') return 'https://api.openai.com/v1';
        if (svc === 'vision.model') return 'gpt-4o';
        return null;
      });
      const config = await loadConfig();
      expect(config).toBeNull();
    });
  });

  describe('loadAllConfigs', () => {
    it('仅主模型配置时返回单元素数组', async () => {
      vi.mocked(getKey).mockImplementation(async (svc: string) => {
        if (svc === 'vision.base_url') return 'https://api.openai.com/v1';
        if (svc === 'vision.model') return 'gpt-4o';
        if (svc === 'vision') return 'sk-primary';
        return null;
      });
      const configs = await loadAllConfigs();
      expect(configs).toHaveLength(1);
      expect(configs[0].model).toBe('gpt-4o');
    });

    it('主模型 + 2 个备选模型时返回 3 个配置', async () => {
      vi.mocked(getKey).mockImplementation(async (svc: string) => {
        const map: Record<string, string> = {
          'vision': 'sk-primary',
          'vision.base_url': 'https://api.primary.com/v1',
          'vision.model': 'primary-model',
          'vision.fallback.0': 'sk-fb0',
          'vision.fallback.0.base_url': 'https://api.fb0.com/v1',
          'vision.fallback.0.model': 'fb0-model',
          'vision.fallback.1': 'sk-fb1',
          'vision.fallback.1.base_url': 'https://api.fb1.com/v1',
          'vision.fallback.1.model': 'fb1-model',
        };
        return map[svc] ?? null;
      });
      const configs = await loadAllConfigs();
      expect(configs).toHaveLength(3);
      expect(configs[0].model).toBe('primary-model');
      expect(configs[1].model).toBe('fb0-model');
      expect(configs[2].model).toBe('fb1-model');
    });

    it('主模型未配置但备选存在时返回备选', async () => {
      vi.mocked(getKey).mockImplementation(async (svc: string) => {
        const map: Record<string, string> = {
          'vision.fallback.0': 'sk-fb0',
          'vision.fallback.0.base_url': 'https://api.fb0.com/v1',
          'vision.fallback.0.model': 'fb0-model',
        };
        return map[svc] ?? null;
      });
      const configs = await loadAllConfigs();
      expect(configs).toHaveLength(1);
      expect(configs[0].model).toBe('fb0-model');
    });

    it('全部未配置时返回空数组', async () => {
      vi.mocked(getKey).mockResolvedValue(null);
      const configs = await loadAllConfigs();
      expect(configs).toEqual([]);
    });

    it('备选不连续时在第一个缺失处停止', async () => {
      vi.mocked(getKey).mockImplementation(async (svc: string) => {
        const map: Record<string, string> = {
          'vision': 'sk-primary',
          'vision.base_url': 'https://api.primary.com/v1',
          'vision.model': 'primary-model',
          'vision.fallback.0': 'sk-fb0',
          'vision.fallback.0.base_url': 'https://api.fb0.com/v1',
          'vision.fallback.0.model': 'fb0-model',
          // 跳过 fallback.1
          'vision.fallback.2': 'sk-fb2',
          'vision.fallback.2.base_url': 'https://api.fb2.com/v1',
          'vision.fallback.2.model': 'fb2-model',
        };
        return map[svc] ?? null;
      });
      const configs = await loadAllConfigs();
      // 应在 fallback.1 缺失处停止，不包含 fallback.2
      expect(configs).toHaveLength(2);
      expect(configs[1].model).toBe('fb0-model');
    });
  });

  describe('getFallbackCount', () => {
    it('无备选时返回 0', async () => {
      vi.mocked(getKey).mockResolvedValue(null);
      expect(await getFallbackCount()).toBe(0);
    });

    it('有 2 个备选时返回 2', async () => {
      vi.mocked(getKey).mockImplementation(async (svc: string) => {
        if (svc === 'vision.fallback.0') return 'sk-fb0';
        if (svc === 'vision.fallback.1') return 'sk-fb1';
        return null;
      });
      expect(await getFallbackCount()).toBe(2);
    });
  });

  describe('missingConfigHint', () => {
    it('包含 CLI 配置引导', () => {
      const hint = missingConfigHint();
      expect(hint).toContain('deepseek-plugin-cli auth set vision');
      expect(hint).toContain('deepseek-plugin-cli vision config');
      expect(hint).toContain('--base-url');
      expect(hint).toContain('--model');
    });
  });
});