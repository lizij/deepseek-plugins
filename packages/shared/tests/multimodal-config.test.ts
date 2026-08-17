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
  loadConfig,
  loadAllConfigs,
  loadAllModels,
  missingConfigHint,
  setModel,
  addModel,
  removeModel,
  updateModel,
  moveModel,
} from '../src/multimodal-config.js';

const STORAGE_KEY = 'multimodal.models';

function modelsJson(models: Array<{ base_url: string; model: string; api_key: string }>): string {
  return JSON.stringify(models);
}

describe('multimodal-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('第一个模型配置齐全时返回 MultimodalConfig', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://api.openai.com/v1', model: 'gpt-4o', api_key: 'sk-test-key' },
        ]),
      });
      const config = await loadConfig();
      expect(config).toEqual({
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        apiKey: 'sk-test-key',
      });
    });

    it('无配置时返回 null', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      expect(await loadConfig()).toBeNull();
    });

    it('第一个模型缺少 api_key 时返回 null', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://api.openai.com/v1', model: 'gpt-4o', api_key: '' },
        ]),
      });
      expect(await loadConfig()).toBeNull();
    });
  });

  describe('loadAllConfigs', () => {
    it('仅一个模型时返回单元素数组', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://api.primary.com/v1', model: 'primary-model', api_key: 'sk-primary' },
        ]),
      });
      const configs = await loadAllConfigs();
      expect(configs).toHaveLength(1);
      expect(configs[0]!.model).toBe('primary-model');
    });

    it('3 个模型时返回 3 个配置', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://api.primary.com/v1', model: 'primary-model', api_key: 'sk-primary' },
          { base_url: 'https://api.fb0.com/v1', model: 'fb0-model', api_key: 'sk-fb0' },
          { base_url: 'https://api.fb1.com/v1', model: 'fb1-model', api_key: 'sk-fb1' },
        ]),
      });
      const configs = await loadAllConfigs();
      expect(configs).toHaveLength(3);
      expect(configs[0]!.model).toBe('primary-model');
      expect(configs[1]!.model).toBe('fb0-model');
      expect(configs[2]!.model).toBe('fb1-model');
    });

    it('无配置时返回空数组', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      expect(await loadAllConfigs()).toEqual([]);
    });

    it('过滤掉不完整的模型配置', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://api.primary.com/v1', model: 'primary-model', api_key: 'sk-primary' },
          { base_url: '', model: 'fb0-model', api_key: 'sk-fb0' },
          { base_url: 'https://api.fb1.com/v1', model: '', api_key: 'sk-fb1' },
        ]),
      });
      const configs = await loadAllConfigs();
      expect(configs).toHaveLength(1);
      expect(configs[0]!.model).toBe('primary-model');
    });
  });

  describe('loadAllModels', () => {
    it('不过滤缺少 api_key 的模型', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://api.primary.com/v1', model: 'primary-model', api_key: '' },
          { base_url: 'https://api.fb0.com/v1', model: 'fb0-model', api_key: 'sk-fb0' },
        ]),
      });
      const models = await loadAllModels();
      expect(models).toHaveLength(2);
      expect(models[0]!.apiKey).toBe('');
      expect(models[1]!.apiKey).toBe('sk-fb0');
    });
  });

  describe('setModel', () => {
    it('无现有配置时新建索引 0 的模型', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      await setModel(0, { baseUrl: 'https://api.test.com/v1', model: 'gpt-4o', apiKey: 'sk' });
      expect(updateCredentials).toHaveBeenCalledTimes(1);
      const mutator = vi.mocked(updateCredentials).mock.calls[0]![0];
      const creds: Record<string, string> = {};
      mutator(creds);
      const stored = JSON.parse(creds[STORAGE_KEY]!);
      expect(stored).toHaveLength(1);
      expect(stored[0].base_url).toBe('https://api.test.com/v1');
      expect(stored[0].model).toBe('gpt-4o');
      expect(stored[0].api_key).toBe('sk');
    });

    it('仅更新提供的字段', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://old', model: 'old-model', api_key: 'old-key' },
        ]),
      });
      await setModel(0, { model: 'new-model' });
      const mutator = vi.mocked(updateCredentials).mock.calls[0]![0];
      const creds: Record<string, string> = {
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://old', model: 'old-model', api_key: 'old-key' },
        ]),
      };
      mutator(creds);
      const stored = JSON.parse(creds[STORAGE_KEY]!);
      expect(stored[0].base_url).toBe('https://old');
      expect(stored[0].model).toBe('new-model');
      expect(stored[0].api_key).toBe('old-key');
    });

    it('索引超出当前长度时填充空模型', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://p', model: 'p', api_key: 'k' },
        ]),
      });
      await setModel(2, { baseUrl: 'https://new', model: 'new-model', apiKey: 'new-key' });
      const mutator = vi.mocked(updateCredentials).mock.calls[0]![0];
      const creds: Record<string, string> = {
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://p', model: 'p', api_key: 'k' },
        ]),
      };
      mutator(creds);
      const stored = JSON.parse(creds[STORAGE_KEY]!);
      expect(stored).toHaveLength(3);
      expect(stored[1].base_url).toBe('');
      expect(stored[2].model).toBe('new-model');
    });
  });

  describe('addModel', () => {
    it('追加到数组末尾并返回其索引', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://p', model: 'p', api_key: 'k' },
        ]),
      });
      const idx = await addModel('https://api.fb.com/v1', 'fb-model', 'sk-fb');
      expect(idx).toBe(1);
      const mutator = vi.mocked(updateCredentials).mock.calls[0]![0];
      const creds: Record<string, string> = {
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://p', model: 'p', api_key: 'k' },
        ]),
      };
      mutator(creds);
      const stored = JSON.parse(creds[STORAGE_KEY]!);
      expect(stored).toHaveLength(2);
      expect(stored[1].model).toBe('fb-model');
      expect(stored[1].api_key).toBe('sk-fb');
    });

    it('无现有模型时返回索引 0', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      const idx = await addModel('https://api.fb.com/v1', 'fb-model');
      expect(idx).toBe(0);
    });
  });

  describe('removeModel', () => {
    it('不存在的索引返回 false', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      expect(await removeModel(0)).toBe(false);
      expect(updateCredentials).not.toHaveBeenCalled();
    });

    it('存在的索引删除并返回 true', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://p', model: 'p', api_key: 'k' },
          { base_url: 'https://0', model: 'm0', api_key: 'k0' },
        ]),
      });
      expect(await removeModel(0)).toBe(true);
      const mutator = vi.mocked(updateCredentials).mock.calls[0]![0];
      const creds: Record<string, string> = {
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://p', model: 'p', api_key: 'k' },
          { base_url: 'https://0', model: 'm0', api_key: 'k0' },
        ]),
      };
      mutator(creds);
      const stored = JSON.parse(creds[STORAGE_KEY]!);
      expect(stored).toHaveLength(1);
      expect(stored[0].model).toBe('m0');
    });
  });

  describe('missingConfigHint', () => {
    it('包含 CLI 配置引导', () => {
      const hint = missingConfigHint();
      expect(hint).toContain('deepseek-plugin-cli multimodal set');
      expect(hint).toContain('--base-url');
      expect(hint).toContain('--model');
      expect(hint).toContain('--api-key');
    });
  });

  describe('updateModel', () => {
    it('仅更新提供的字段', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://p', model: 'p', api_key: 'k' },
          { base_url: 'https://old', model: 'old-model', api_key: 'old-key' },
        ]),
      });
      await updateModel(1, { baseUrl: 'https://new.com/v1' });
      const mutator = vi.mocked(updateCredentials).mock.calls[0]![0];
      const creds: Record<string, string> = {
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://p', model: 'p', api_key: 'k' },
          { base_url: 'https://old', model: 'old-model', api_key: 'old-key' },
        ]),
      };
      mutator(creds);
      const stored = JSON.parse(creds[STORAGE_KEY]!);
      expect(stored[1].base_url).toBe('https://new.com/v1');
      expect(stored[1].model).toBe('old-model');
      expect(stored[1].api_key).toBe('old-key');
    });

    it('apiKey 为空字符串时清空该字段', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://p', model: 'p', api_key: 'k' },
          { base_url: 'https://0', model: 'm0', api_key: 'k0' },
        ]),
      });
      await updateModel(1, { apiKey: '' });
      const mutator = vi.mocked(updateCredentials).mock.calls[0]![0];
      const creds: Record<string, string> = {
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://p', model: 'p', api_key: 'k' },
          { base_url: 'https://0', model: 'm0', api_key: 'k0' },
        ]),
      };
      mutator(creds);
      const stored = JSON.parse(creds[STORAGE_KEY]!);
      expect(stored[1].api_key).toBe('');
    });
  });

  describe('moveModel', () => {
    it('越界索引返回 false', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({});
      expect(await moveModel(0, 1)).toBe(false);
      expect(updateCredentials).not.toHaveBeenCalled();
    });

    it('边界方向返回 false', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://p', model: 'p', api_key: 'k' },
          { base_url: 'https://0', model: 'm0', api_key: 'k0' },
        ]),
      });
      expect(await moveModel(0, -1)).toBe(false);
      expect(updateCredentials).not.toHaveBeenCalled();
    });

    it('正常交换相邻模型', async () => {
      vi.mocked(getAllKeys).mockResolvedValue({
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://p', model: 'p', api_key: 'k' },
          { base_url: 'https://0', model: 'm0', api_key: 'k0' },
          { base_url: 'https://1', model: 'm1', api_key: 'k1' },
        ]),
      });
      expect(await moveModel(0, 1)).toBe(true);
      const mutator = vi.mocked(updateCredentials).mock.calls[0]![0];
      const creds: Record<string, string> = {
        [STORAGE_KEY]: modelsJson([
          { base_url: 'https://p', model: 'p', api_key: 'k' },
          { base_url: 'https://0', model: 'm0', api_key: 'k0' },
          { base_url: 'https://1', model: 'm1', api_key: 'k1' },
        ]),
      };
      mutator(creds);
      const stored = JSON.parse(creds[STORAGE_KEY]!);
      expect(stored[0].model).toBe('m0');
      expect(stored[1].model).toBe('p');
      expect(stored[2].model).toBe('m1');
    });
  });
});
