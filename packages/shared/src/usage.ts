import { loadAllSources, getSource } from './sources.js';
import { getProvider } from './providers/registry.js';
import type { SourceConfig } from './sources.js';
import type { UsageResult } from './providers/types.js';

export type { UsageInfo, UsageResult } from './providers/types.js';

/** 单来源使用量查询结果。 */
export interface SourceUsageResult {
  source: { id: string; name: string; type: string };
  result: UsageResult | null;
  error?: string;
}

/** 查询指定来源的使用量。 */
export async function fetchUsageForSource(source: SourceConfig): Promise<SourceUsageResult> {
  if (!source.features.includes('usage')) {
    return {
      source: { id: source.id, name: source.name, type: source.type },
      result: null,
      error: `来源 ${source.name} 未启用 usage 功能`,
    };
  }
  const provider = getProvider(source.type);
  if (!provider || !provider.fetchUsage) {
    return {
      source: { id: source.id, name: source.name, type: source.type },
      result: null,
      error: `供应商 ${source.type} 不支持使用量查询`,
    };
  }
  try {
    const result = await provider.fetchUsage(source.apiKey, source.baseUrl);
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

/** 查询所有启用了 usage 功能的来源的使用量。 */
export async function fetchAllUsages(): Promise<SourceUsageResult[]> {
  const sources = await loadAllSources();
  const usageSources = sources.filter((s) => s.features.includes('usage'));
  return Promise.all(usageSources.map(fetchUsageForSource));
}
