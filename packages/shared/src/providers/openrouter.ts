import type { ProviderAdapter, BalanceResult, ModelInfo } from './types.js';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * OpenRouter 适配器。
 * 支持 balance（/auth/key 返回 limit - usage）和 models（/models）。
 */
export const openrouterAdapter: ProviderAdapter = {
  type: 'openrouter',
  name: 'OpenRouter',
  website: 'https://openrouter.ai',
  defaultBaseUrl: DEFAULT_BASE_URL,
  supportedFeatures: ['balance', 'models'],

  async fetchBalance(apiKey: string, baseUrl?: string): Promise<BalanceResult> {
    const url = `${(baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')}/auth/key`;
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
        data: {
          label?: string;
          limit?: number;
          usage?: number;
          limit_remaining?: number;
        };
      };
      const limit = data.data?.limit ?? 0;
      const usage = data.data?.usage ?? 0;
      const remaining = data.data?.limit_remaining ?? (limit - usage);
      return {
        isAvailable: remaining > 0,
        balances: [
          {
            currency: 'USD',
            totalBalance: remaining.toFixed(4),
            grantedBalance: '0',
            toppedUpBalance: remaining.toFixed(4),
          },
        ],
      };
    } finally {
      clearTimeout(timer);
    }
  },

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
