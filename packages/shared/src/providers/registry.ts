import type { ProviderAdapter, ProviderType } from './types.js';
import { deepseekAdapter } from './deepseek.js';
import { opencodeZenAdapter } from './opencode-zen.js';
import { opencodeGoAdapter } from './opencode-go.js';
import { openrouterAdapter } from './openrouter.js';

const registry = new Map<ProviderType, ProviderAdapter>();

function register(adapter: ProviderAdapter): void {
  registry.set(adapter.type, adapter);
}

register(deepseekAdapter);
register(opencodeZenAdapter);
register(opencodeGoAdapter);
register(openrouterAdapter);

/** 获取指定类型的供应商适配器，不存在返回 undefined。 */
export function getProvider(type: ProviderType): ProviderAdapter | undefined {
  return registry.get(type);
}

/** 列出所有已支持的供应商适配器。 */
export function listProviders(): ProviderAdapter[] {
  return [...registry.values()];
}

/** 判断指定供应商类型是否已支持。 */
export function isProviderSupported(type: string): type is ProviderType {
  return registry.has(type as ProviderType);
}
