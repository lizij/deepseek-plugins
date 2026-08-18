import type { ProviderAdapter, ModelInfo } from './types.js';

const DEFAULT_BASE_URL = 'https://opencode.ai/zen/v1';

/**
 * OpenCode Zen 适配器。
 * 已确认支持 models（/zen/v1/models）。
 * balance / usage 的公开 API 待确认，暂不声明支持。
 */
export const opencodeZenAdapter: ProviderAdapter = {
  type: 'opencode-zen',
  name: 'OpenCode Zen',
  website: 'https://opencode.ai',
  defaultBaseUrl: DEFAULT_BASE_URL,
  supportedFeatures: ['models'],

  async fetchModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
    const url = `${(baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')}/models`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new Error(`API 请求失败 (HTTP ${resp.status})`);
      }
      const data = (await resp.json()) as {
        data: Array<{ id: string; owned_by?: string }>;
      };
      return (data.data ?? []).map((m) => ({ id: m.id, ownedBy: m.owned_by }));
    } finally {
      clearTimeout(timer);
    }
  },
};
