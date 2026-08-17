import type { MultimodalConfig } from '@deepseek-plugins/shared/multimodal-config';
import type { ModelEntry } from './types.js';

/** 将 shared 的 MultimodalConfig[] 转为 GUI 所需的 ModelEntry[]。 */
export function toModelEntries(configs: MultimodalConfig[]): ModelEntry[] {
  return configs.map((cfg, i) => ({
    index: i,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    apiKey: cfg.apiKey,
  }));
}
