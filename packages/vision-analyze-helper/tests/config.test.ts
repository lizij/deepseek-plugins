import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig, missingConfigHint } from '../src/config.js';

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