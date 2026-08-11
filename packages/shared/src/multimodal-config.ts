import { getAllKeys, setKey, unsetKey } from './credentials.js';

/** 多模态模型调用所需配置，所有配置均从加密本地文件读取。 */
export interface MultimodalConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** 兼容旧名称。 */
export type VisionConfig = MultimodalConfig;

/** 默认提问词，避免多处硬编码。 */
export const DEFAULT_PROMPT = '请详细描述这张图片的内容。';

/** 配置存储前缀，主模型与备选模型共用此前缀。 */
const CONFIG_PREFIX = 'vision';

/**
 * 读取主多模态模型配置。
 * base_url / model / API Key 均从加密本地文件读取。
 * 任一缺失返回 null，调用方负责给出明确错误提示。
 */
export async function loadConfig(): Promise<MultimodalConfig | null> {
  const all = await getAllKeys();
  return readConfigByPrefix(all, CONFIG_PREFIX);
}

/**
 * 读取全部多模态模型配置（主模型 + 备选模型），按优先级排序。
 * 主模型从 `vision` / `vision.base_url` / `vision.model` 读取，
 * 备选模型从 `vision.fallback.0` / `vision.fallback.0.base_url` / `vision.fallback.0.model` 等顺序读取。
 * 一次性读取所有凭据，避免多次解密。
 * 同一套配置同时服务于 image / audio / pdf 等多种模态。
 */
export async function loadAllConfigs(): Promise<MultimodalConfig[]> {
  const all = await getAllKeys();
  const configs: MultimodalConfig[] = [];

  const primary = readConfigByPrefix(all, CONFIG_PREFIX);
  if (primary) configs.push(primary);

  for (let i = 0; ; i++) {
    const cfg = readConfigByPrefix(all, `${CONFIG_PREFIX}.fallback.${i}`);
    if (!cfg) break;
    configs.push(cfg);
  }

  return configs;
}

/** 从已读取的凭据 map 中按前缀组装单个模型配置。 */
function readConfigByPrefix(all: Record<string, string>, prefix: string): MultimodalConfig | null {
  const baseUrl = all[`${prefix}.base_url`];
  const model = all[`${prefix}.model`];
  const apiKey = all[prefix];
  if (!baseUrl || !model || !apiKey) return null;
  return { baseUrl, model, apiKey };
}

/** 获取已配置的备选模型数量（不含主模型）。基于 loadAllConfigs 结果，确保终止条件一致。 */
export async function getFallbackCount(): Promise<number> {
  const configs = await loadAllConfigs();
  return Math.max(0, configs.length - 1);
}

/**
 * 设置主模型的 base_url 和/或 model。
 * 只更新提供的字段，未提供的字段保持不变。
 */
export async function setPrimaryConfig(opts: { baseUrl?: string; model?: string }): Promise<void> {
  if (opts.baseUrl) {
    await setKey(`${CONFIG_PREFIX}.base_url`, opts.baseUrl);
  }
  if (opts.model) {
    await setKey(`${CONFIG_PREFIX}.model`, opts.model);
  }
}

/**
 * 添加一个备选模型，返回其索引（从 0 开始）。
 * base_url 和 model 写入后，API Key 需通过 `auth set vision.fallback.<index>` 单独设置。
 */
export async function addFallbackConfig(baseUrl: string, model: string): Promise<number> {
  const idx = await getFallbackCount();
  await setKey(`${CONFIG_PREFIX}.fallback.${idx}.base_url`, baseUrl);
  await setKey(`${CONFIG_PREFIX}.fallback.${idx}.model`, model);
  return idx;
}

/**
 * 删除指定索引的备选模型，并重排后续索引避免空洞。
 * 返回是否成功删除（索引不存在时返回 false）。
 */
export async function removeFallbackConfig(idx: number): Promise<boolean> {
  const all = await getAllKeys();
  const hasTarget =
    all[`${CONFIG_PREFIX}.fallback.${idx}`] ||
    all[`${CONFIG_PREFIX}.fallback.${idx}.base_url`] ||
    all[`${CONFIG_PREFIX}.fallback.${idx}.model`];
  if (!hasTarget) return false;

  // 删除目标索引的三个 key
  await unsetKey(`${CONFIG_PREFIX}.fallback.${idx}`);
  await unsetKey(`${CONFIG_PREFIX}.fallback.${idx}.base_url`);
  await unsetKey(`${CONFIG_PREFIX}.fallback.${idx}.model`);

  // 将后续索引整体前移一位，避免空洞导致 loadAllConfigs 在第一个缺失处停止
  const total = await getFallbackCount();
  for (let i = idx + 1; i <= total + 1; i++) {
    const srcPrefix = `${CONFIG_PREFIX}.fallback.${i}`;
    const dstPrefix = `${CONFIG_PREFIX}.fallback.${i - 1}`;
    const apiKey = all[srcPrefix];
    const baseUrl = all[`${srcPrefix}.base_url`];
    const model = all[`${srcPrefix}.model`];
    if (apiKey) await setKey(dstPrefix, apiKey);
    if (baseUrl) await setKey(`${dstPrefix}.base_url`, baseUrl);
    if (model) await setKey(`${dstPrefix}.model`, model);
    await unsetKey(srcPrefix);
    await unsetKey(`${srcPrefix}.base_url`);
    await unsetKey(`${srcPrefix}.model`);
  }

  return true;
}

/** 生成缺失配置时的引导提示文本。 */
export function missingConfigHint(): string {
  return [
    '多模态模型未配置，请按以下步骤设置：',
    '1. 设置 API Key（交互式输入）：',
    '   deepseek-plugin-cli auth set vision',
    '2. 配置 base_url 与 model：',
    '   deepseek-plugin-cli multimodal config --base-url https://api.openai.com/v1 --model gpt-4o',
    '   （同一套配置同时支持图片 / 音频 / PDF 输入）',
  ].join('\n');
}
