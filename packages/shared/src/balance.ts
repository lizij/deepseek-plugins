import { getKey } from './credentials.js';
import { loadAllSources, getSource } from './sources.js';
import { getProvider } from './providers/registry.js';
import type { SourceConfig } from './sources.js';
import type { BalanceResult } from './providers/types.js';

export type { BalanceInfo, BalanceResult } from './providers/types.js';

/** 格式化余额数值，自动选择合适的精度。 */
export function formatBalance(s: string, currency: string): string {
  const n = parseFloat(s);
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : '';
  if (isNaN(n)) return `${symbol}${s}`;
  if (n >= 1000) return `${symbol}${n.toFixed(0)}`;
  if (n >= 10) return `${symbol}${n.toFixed(1)}`;
  return `${symbol}${n.toFixed(2)}`;
}

/** 单来源余额查询结果。 */
export interface SourceBalanceResult {
  source: { id: string; name: string; type: string };
  result: BalanceResult | null;
  error?: string;
}

/**
 * 查询指定来源的余额。
 * 若来源未启用 balance 功能，返回错误。
 */
export async function fetchBalanceForSource(source: SourceConfig): Promise<SourceBalanceResult> {
  if (!source.features.includes('balance')) {
    return {
      source: { id: source.id, name: source.name, type: source.type },
      result: null,
      error: `来源 ${source.name} 未启用 balance 功能`,
    };
  }
  const provider = getProvider(source.type);
  if (!provider || !provider.fetchBalance) {
    return {
      source: { id: source.id, name: source.name, type: source.type },
      result: null,
      error: `供应商 ${source.type} 不支持余额查询`,
    };
  }
  try {
    const result = await provider.fetchBalance(source.apiKey, source.baseUrl);
    return {
      source: { id: source.id, name: source.name, type: source.type },
      result,
    };
  } catch (err) {
    return {
      source: { id: source.id, name: source.name, type: source.type },
      result: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 查询所有启用了 balance 功能的来源的余额。 */
export async function fetchAllBalances(): Promise<SourceBalanceResult[]> {
  const sources = await loadAllSources();
  const balanceSources = sources.filter((s) => s.features.includes('balance'));
  return Promise.all(balanceSources.map(fetchBalanceForSource));
}

/**
 * 获取 DeepSeek 账户余额，失败返回 null。
 * 向后兼容：优先使用 sources 中 id 为 'deepseek' 的来源，
 * 若不存在则回退到旧的 deepseek service key。
 */
export async function fetchBalance(): Promise<{ result: BalanceResult | null; error?: string }> {
  const source = await getSource('deepseek');
  if (source) {
    const { result, error } = await fetchBalanceForSource(source);
    return { result, error };
  }

  // 回退到旧的 deepseek service key
  const apiKey = await getKey('deepseek');
  if (!apiKey) {
    return { result: null, error: '未配置 API Key，请执行: deepseek-plugin-cli auth set deepseek' };
  }
  const provider = getProvider('deepseek');
  if (!provider || !provider.fetchBalance) {
    return { result: null, error: 'DeepSeek 供应商适配器未注册' };
  }
  try {
    const result = await provider.fetchBalance(apiKey);
    return { result };
  } catch (err) {
    return { result: null, error: `网络错误: ${err instanceof Error ? err.message : String(err)}` };
  }
}
