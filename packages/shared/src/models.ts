import { loadAllSources, getSource } from './sources.js';
import { getProvider } from './providers/registry.js';
import type { SourceConfig } from './sources.js';
import type { ModelInfo } from './providers/types.js';

export type { ModelInfo } from './providers/types.js';

/** 单来源模型列表查询结果。 */
export interface SourceModelsResult {
  source: { id: string; name: string; type: string };
  models: ModelInfo[] | null;
  error?: string;
}

/** 查询指定来源的可用模型列表。 */
export async function fetchModelsForSource(source: SourceConfig): Promise<SourceModelsResult> {
  if (!source.features.includes('models')) {
    return {
      source: { id: source.id, name: source.name, type: source.type },
      models: null,
      error: `来源 ${source.name} 未启用 models 功能`,
    };
  }
  const provider = getProvider(source.type);
  if (!provider || !provider.fetchModels) {
    return {
      source: { id: source.id, name: source.name, type: source.type },
      models: null,
      error: `供应商 ${source.type} 不支持模型列表查询`,
    };
  }
  try {
    const models = await provider.fetchModels(source.apiKey, source.baseUrl);
    return {
      source: { id: source.id, name: source.name, type: source.type },
      models,
    };
  } catch (err) {
    return {
      source: { id: source.id, name: source.name, type: source.type },
      models: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 查询所有启用了 models 功能的来源的模型列表。 */
export async function fetchAllModels(): Promise<SourceModelsResult[]> {
  const sources = await loadAllSources();
  const modelSources = sources.filter((s) => s.features.includes('models'));
  return Promise.all(modelSources.map(fetchModelsForSource));
}
