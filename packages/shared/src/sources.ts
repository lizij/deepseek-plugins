import { getAllKeys, updateCredentials } from './credentials.js';
import { getProvider, isProviderSupported } from './providers/registry.js';
import type { ProviderType, FeatureType } from './providers/types.js';

/** 来源配置（对外暴露的结构）。 */
export interface SourceConfig {
  id: string;
  name: string;
  type: ProviderType;
  apiKey: string;
  baseUrl?: string;
  features: FeatureType[];
}

/** 存储层的来源结构（snake_case）。 */
interface StoredSource {
  id: string;
  name: string;
  type: ProviderType;
  api_key: string;
  base_url?: string;
  features: FeatureType[];
}

/** 来源配置在凭据文件中的存储 key。值为 JSON 数组，按优先级排列。 */
const STORAGE_KEY = 'sources';

/** 来源数量上限。 */
const MAX_SOURCES = 50;

/**
 * 从凭据文件读取所有来源配置。
 * 若 sources 键不存在但存在旧的 deepseek service key，自动迁移。
 */
async function loadSources(): Promise<StoredSource[]> {
  const all = await getAllKeys();
  const raw = all[STORAGE_KEY];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const sources = parsed.filter(
          (s): s is StoredSource =>
            s &&
            typeof s.id === 'string' &&
            typeof s.name === 'string' &&
            typeof s.type === 'string' &&
            typeof s.api_key === 'string' &&
            Array.isArray(s.features),
        );
        // 清理：若 sources 中已有 deepseek 来源且旧 deepseek service key 仍存在，删除旧键
        const hasDeepseekSource = sources.some((s) => s.id === 'deepseek');
        if (hasDeepseekSource && all['deepseek']) {
          await updateCredentials((creds) => {
            delete creds['deepseek'];
          });
        }
        return sources;
      }
    } catch {
      // fall through to migration
    }
  }

  // 自动迁移：旧的 deepseek service key → sources 数组
  const deepseekKey = all['deepseek'];
  if (deepseekKey) {
    const migrated: StoredSource = {
      id: 'deepseek',
      name: 'DeepSeek 官方',
      type: 'deepseek',
      api_key: deepseekKey,
      features: ['balance', 'models'],
    };
    await updateCredentials((creds) => {
      creds[STORAGE_KEY] = JSON.stringify([migrated]);
      delete creds['deepseek'];
    });
    return [migrated];
  }

  return [];
}

/** 将来源数组序列化后写入凭据文件。空数组时删除该 key。 */
async function saveSources(sources: StoredSource[]): Promise<void> {
  await updateCredentials((creds) => {
    if (sources.length === 0) {
      delete creds[STORAGE_KEY];
    } else {
      creds[STORAGE_KEY] = JSON.stringify(sources);
    }
  });
}

/** 校验 features 是否为供应商 supportedFeatures 的子集。 */
function validateFeatures(type: ProviderType, features: FeatureType[]): void {
  const provider = getProvider(type);
  if (!provider) {
    throw new Error(`不支持的供应商类型: ${type}，请运行 'source providers' 查看已支持的供应商`);
  }
  const supported = new Set(provider.supportedFeatures);
  for (const f of features) {
    if (!supported.has(f)) {
      throw new Error(`供应商 ${provider.name} 不支持功能: ${f}（支持: ${provider.supportedFeatures.join(', ')}）`);
    }
  }
}

/** 读取所有来源配置（按优先级排列）。 */
export async function loadAllSources(): Promise<SourceConfig[]> {
  const sources = await loadSources();
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    apiKey: s.api_key,
    baseUrl: s.base_url,
    features: s.features,
  }));
}

/** 根据 id 获取指定来源，不存在返回 null。 */
export async function getSource(id: string): Promise<SourceConfig | null> {
  const sources = await loadSources();
  const s = sources.find((x) => x.id === id);
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    type: s.type,
    apiKey: s.api_key,
    baseUrl: s.base_url,
    features: s.features,
  };
}

/**
 * 新增来源。
 * id 必填且唯一；type 必须是已支持的供应商；features 默认为该供应商的全部 supportedFeatures。
 */
export async function addSource(
  id: string,
  type: ProviderType,
  opts: { name?: string; apiKey: string; baseUrl?: string; features?: FeatureType[] },
): Promise<void> {
  if (!id || !id.trim()) {
    throw new Error('来源 id 不能为空');
  }
  if (!isProviderSupported(type)) {
    throw new Error(`不支持的供应商类型: ${type}，请运行 'source providers' 查看已支持的供应商`);
  }

  const sources = await loadSources();
  if (sources.some((s) => s.id === id)) {
    throw new Error(`来源 id 已存在: ${id}`);
  }
  if (sources.length >= MAX_SOURCES) {
    throw new Error(`来源数量已达上限（${MAX_SOURCES}）`);
  }

  const provider = getProvider(type)!;
  const features = opts.features ?? provider.supportedFeatures;
  validateFeatures(type, features);

  sources.push({
    id,
    name: opts.name ?? provider.name,
    type,
    api_key: opts.apiKey,
    base_url: opts.baseUrl,
    features,
  });
  await saveSources(sources);
}

/**
 * 更新指定来源的字段。
 * 只更新提供的字段，未提供的保持不变。
 */
export async function updateSource(
  id: string,
  opts: { name?: string; apiKey?: string; baseUrl?: string; features?: FeatureType[] },
): Promise<void> {
  const sources = await loadSources();
  const s = sources.find((x) => x.id === id);
  if (!s) {
    throw new Error(`来源不存在: ${id}`);
  }

  if (opts.name !== undefined) s.name = opts.name;
  if (opts.apiKey !== undefined) s.api_key = opts.apiKey;
  if (opts.baseUrl !== undefined) s.base_url = opts.baseUrl || undefined;
  if (opts.features !== undefined) {
    validateFeatures(s.type, opts.features);
    s.features = opts.features;
  }

  await saveSources(sources);
}

/** 删除指定来源，返回是否成功。 */
export async function removeSource(id: string): Promise<boolean> {
  const sources = await loadSources();
  const idx = sources.findIndex((s) => s.id === id);
  if (idx < 0) return false;
  sources.splice(idx, 1);
  await saveSources(sources);
  return true;
}

/**
 * 调整来源优先级。
 * dir 为 -1 时与上一个交换，为 1 时与下一个交换。
 */
export async function moveSource(id: string, dir: -1 | 1): Promise<boolean> {
  const sources = await loadSources();
  const idx = sources.findIndex((s) => s.id === id);
  if (idx < 0) return false;
  const other = idx + dir;
  if (other < 0 || other >= sources.length) return false;
  const a = sources[idx]!;
  const b = sources[other]!;
  sources[idx] = b;
  sources[other] = a;
  await saveSources(sources);
  return true;
}
