import { getAllKeys } from '@deepseek-plugins/shared';

/** 视觉模型调用所需配置，所有配置均从加密本地文件读取。 */
export interface VisionConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** 默认提问词，避免多处硬编码。 */
export const DEFAULT_PROMPT = '请详细描述这张图片的内容。';

/**
 * 读取主视觉模型配置。
 * base_url / model / API Key 均从加密本地文件读取。
 * 任一缺失返回 null，调用方负责给出明确错误提示。
 */
export async function loadConfig(): Promise<VisionConfig | null> {
  const all = await getAllKeys();
  return readConfigByPrefix(all, 'vision');
}

/**
 * 读取全部视觉模型配置（主模型 + 备选模型），按优先级排序。
 * 主模型从 `vision` / `vision.base_url` / `vision.model` 读取，
 * 备选模型从 `vision.fallback.0` / `vision.fallback.0.base_url` / `vision.fallback.0.model` 等顺序读取。
 * 一次性读取所有凭据，避免多次解密。
 */
export async function loadAllConfigs(): Promise<VisionConfig[]> {
  const all = await getAllKeys();
  const configs: VisionConfig[] = [];

  // 主模型
  const primary = readConfigByPrefix(all, 'vision');
  if (primary) configs.push(primary);

  // 备选模型：连续索引，遇到第一个不完整的停止
  for (let i = 0; ; i++) {
    const cfg = readConfigByPrefix(all, `vision.fallback.${i}`);
    if (!cfg) break;
    configs.push(cfg);
  }

  return configs;
}

/** 从已读取的凭据 map 中按前缀组装单个模型配置。 */
function readConfigByPrefix(all: Record<string, string>, prefix: string): VisionConfig | null {
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

/** 生成缺失配置时的引导提示文本。 */
export function missingConfigHint(): string {
  return [
    '视觉模型未配置，请按以下步骤设置：',
    '1. 设置 API Key（交互式输入）：',
    '   deepseek-plugin-cli auth set vision',
    '2. 配置 base_url 与 model：',
    '   deepseek-plugin-cli vision config --base-url https://api.openai.com/v1 --model gpt-4o',
  ].join('\n');
}
