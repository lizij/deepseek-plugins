import { getAllKeys, updateCredentials } from './credentials.js';

/** 多模态模型调用所需配置。 */
export interface MultimodalConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** 兼容旧名称。 */
export type VisionConfig = MultimodalConfig;

/** 默认提问词，避免多处硬编码。 */
export const DEFAULT_PROMPT = '请详细描述这张图片的内容。';

/** 多模态模型配置在凭据文件中的存储 key。值为 JSON 数组，按调用优先级排列。 */
const STORAGE_KEY = 'multimodal.models';

/** 模型数量上限，防止 setModel 传入过大索引创建大量空模型。 */
const MAX_MODELS = 50;

/** 存储层的模型结构（snake_case，与 API 字段对齐）。 */
interface StoredModel {
  base_url: string;
  model: string;
  api_key: string;
}

/**
 * 从凭据文件读取所有多模态模型配置。
 * 优先读取新格式（multimodal.models JSON 数组），
 * 若不存在则回退到旧格式（vision.* 扁平键）并转换。
 */
async function loadModels(): Promise<StoredModel[]> {
  const all = await getAllKeys();
  const raw = all[STORAGE_KEY];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (m): m is StoredModel =>
            m &&
            typeof m.base_url === 'string' &&
            typeof m.model === 'string' &&
            typeof m.api_key === 'string',
        );
      }
    } catch {
      // fall through to legacy format
    }
  }
  return loadLegacyModels(all);
}

/** 从旧格式（vision.* 扁平键）读取模型配置并转换为数组。 */
function loadLegacyModels(all: Record<string, string>): StoredModel[] {
  const models: StoredModel[] = [];

  const primaryApiKey = all['vision'];
  const primaryBaseUrl = all['vision.base_url'];
  const primaryModel = all['vision.model'];
  if (primaryBaseUrl || primaryModel || primaryApiKey) {
    models.push({
      base_url: primaryBaseUrl ?? '',
      model: primaryModel ?? '',
      api_key: primaryApiKey ?? '',
    });
  }

  const fallbackIndices = new Set<number>();
  for (const k of Object.keys(all)) {
    const m = k.match(/^vision\.fallback\.(\d+)(?:\.(base_url|model))?$/);
    if (m) fallbackIndices.add(parseInt(m[1]!, 10));
  }
  const sortedIndices = [...fallbackIndices].sort((a, b) => a - b);

  for (const idx of sortedIndices) {
    const baseUrl = all[`vision.fallback.${idx}.base_url`];
    const model = all[`vision.fallback.${idx}.model`];
    const apiKey = all[`vision.fallback.${idx}`];
    if (!baseUrl && !model && !apiKey) continue;
    models.push({
      base_url: baseUrl ?? '',
      model: model ?? '',
      api_key: apiKey ?? '',
    });
  }

  return models;
}

/** 将模型数组序列化后写入凭据文件。空数组时删除该 key。
 *  同时清理旧格式 vision.* 扁平键，避免新旧格式共存。 */
async function saveModels(models: StoredModel[]): Promise<void> {
  await updateCredentials((creds) => {
    for (const k of Object.keys(creds)) {
      if (k === 'vision' || k.startsWith('vision.')) delete creds[k];
    }
    if (models.length === 0) {
      delete creds[STORAGE_KEY];
    } else {
      creds[STORAGE_KEY] = JSON.stringify(models);
    }
  });
}

/**
 * 读取第一个多模态模型配置。
 * 任一缺失返回 null，调用方负责给出明确错误提示。
 */
export async function loadConfig(): Promise<MultimodalConfig | null> {
  const models = await loadModels();
  const m = models[0];
  if (!m || !m.base_url || !m.model || !m.api_key) return null;
  return { baseUrl: m.base_url, model: m.model, apiKey: m.api_key };
}

/**
 * 读取全部多模态模型配置，按数组顺序排列。
 * 不过滤缺少 api_key 的模型，用于 list / update / remove / move 等索引操作。
 */
export async function loadAllModels(): Promise<MultimodalConfig[]> {
  const models = await loadModels();
  return models.map((m) => ({
    baseUrl: m.base_url,
    model: m.model,
    apiKey: m.api_key,
  }));
}

/**
 * 读取全部多模态模型配置，按数组顺序排列。
 * 过滤掉缺少 api_key 的模型，用于 vision / audio / pdf 调用。
 */
export async function loadAllConfigs(): Promise<MultimodalConfig[]> {
  const models = await loadModels();
  return models
    .filter((m) => m.base_url && m.model && m.api_key)
    .map((m) => ({ baseUrl: m.base_url, model: m.model, apiKey: m.api_key }));
}

/**
 * 设置指定索引位置模型的 base_url / model / api_key。
 * 只更新提供的字段，未提供的字段保持不变。
 * 若索引超出当前数组长度则新建空模型填充（索引上限 MAX_MODELS）。
 */
export async function setModel(
  idx: number,
  opts: { baseUrl?: string; model?: string; apiKey?: string },
): Promise<void> {
  if (idx < 0 || idx >= MAX_MODELS) {
    throw new Error(`模型索引超出范围（0-${MAX_MODELS - 1}）: ${idx}`);
  }
  const models = await loadModels();
  while (models.length <= idx) {
    models.push({ base_url: '', model: '', api_key: '' });
  }
  const m = models[idx];
  if (!m) return;
  if (opts.baseUrl !== undefined) m.base_url = opts.baseUrl;
  if (opts.model !== undefined) m.model = opts.model;
  if (opts.apiKey !== undefined) {
    m.api_key = opts.apiKey;
  }
  await saveModels(models);
}

/**
 * 添加一个模型到数组末尾，返回其索引。
 * base_url / model 必填，api_key 可选（后续可通过 setModel 设置）。
 */
export async function addModel(
  baseUrl: string,
  model: string,
  apiKey?: string,
): Promise<number> {
  const models = await loadModels();
  if (models.length >= MAX_MODELS) {
    throw new Error(`模型数量已达上限（${MAX_MODELS}），请先删除部分模型`);
  }
  models.push({ base_url: baseUrl, model, api_key: apiKey ?? '' });
  await saveModels(models);
  return models.length - 1;
}

/**
 * 删除指定索引的模型。
 * 返回是否成功删除（索引不存在时返回 false）。
 */
export async function removeModel(idx: number): Promise<boolean> {
  const models = await loadModels();
  if (idx < 0 || idx >= models.length) return false;
  models.splice(idx, 1);
  await saveModels(models);
  return true;
}

/**
 * 更新指定索引模型的 base_url / model / api_key。
 * 只更新提供的字段，未提供的字段保持不变。
 */
export async function updateModel(
  idx: number,
  opts: { baseUrl?: string; model?: string; apiKey?: string },
): Promise<void> {
  const models = await loadModels();
  if (idx < 0 || idx >= models.length) return;
  const m = models[idx];
  if (!m) return;
  if (opts.baseUrl !== undefined) m.base_url = opts.baseUrl;
  if (opts.model !== undefined) m.model = opts.model;
  if (opts.apiKey !== undefined) m.api_key = opts.apiKey;
  await saveModels(models);
}

/**
 * 交换相邻两个模型的位置（用于调整调用优先级）。
 * dir 为 -1 时与上一个交换，为 1 时与下一个交换。
 * 返回是否成功（越界时返回 false）。
 */
export async function moveModel(idx: number, dir: -1 | 1): Promise<boolean> {
  const models = await loadModels();
  const other = idx + dir;
  if (idx < 0 || idx >= models.length || other < 0 || other >= models.length) return false;
  const a = models[idx];
  const b = models[other];
  if (!a || !b) return false;
  models[idx] = b;
  models[other] = a;
  await saveModels(models);
  return true;
}

/** 生成缺失配置时的引导提示文本。 */
export function missingConfigHint(): string {
  return [
    '多模态模型未配置，请通过 multimodal 命令设置：',
    '  deepseek-plugin-cli multimodal set --base-url https://open.bigmodel.cn/api/paas/v4 --model glm-4.6v --api-key',
    '  （同一套配置同时支持图片 / 音频 / PDF 输入）',
  ].join('\n');
}
