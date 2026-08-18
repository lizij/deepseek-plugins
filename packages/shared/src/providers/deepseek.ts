import type { ProviderAdapter, BalanceResult, ModelInfo } from './types.js';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';

/** DeepSeek 官方适配器：支持余额查询和模型列表查询。 */
export const deepseekAdapter: ProviderAdapter = {
  type: 'deepseek',
  name: 'DeepSeek 官方',
  website: 'https://platform.deepseek.com',
  defaultBaseUrl: DEFAULT_BASE_URL,
  supportedFeatures: ['balance', 'models'],

  async fetchBalance(apiKey: string, baseUrl?: string): Promise<BalanceResult> {
    const url = `${(baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')}/user/balance`;
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
        is_available: boolean;
        balance_infos: Array<{
          currency: string;
          total_balance: string;
          granted_balance: string;
          topped_up_balance: string;
        }>;
      };
      return {
        isAvailable: data.is_available,
        balances: data.balance_infos.map((b) => ({
          currency: b.currency,
          totalBalance: b.total_balance,
          grantedBalance: b.granted_balance,
          toppedUpBalance: b.topped_up_balance,
        })),
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
