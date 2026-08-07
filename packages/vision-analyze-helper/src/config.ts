import { getKey } from '@deepseek-plugins/shared';

/** 视觉模型调用所需配置，所有配置均从加密本地文件读取。 */
export interface VisionConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

/**
 * 读取主视觉模型配置。
 * base_url / model / API Key 均从加密本地文件读取。
 * 任一缺失返回 null，调用方负责给出明确错误提示。
 */
export async function loadConfig(): Promise<VisionConfig | null> {
  const baseUrl = await getKey('vision.base_url');
  const model = await getKey('vision.model');
  const apiKey = await getKey('vision');
  if (!baseUrl || !model || !apiKey) return null;
  return { baseUrl, model, apiKey };
}

/**
 * 读取全部视觉模型配置（主模型 + 备选模型），按优先级排序。
 * 主模型从 `vision` / `vision.base_url` / `vision.model` 读取，
 * 备选模型从 `vision.fallback.0` / `vision.fallback.0.base_url` / `vision.fallback.0.model` 等顺序读取。
 */
export async function loadAllConfigs(): Promise<VisionConfig[]> {
  const configs: VisionConfig[] = [];
  const primary = await loadConfig();
  if (primary) configs.push(primary);

  for (let i = 0; ; i++) {
    const baseUrl = await getKey(`vision.fallback.${i}.base_url`);
    const model = await getKey(`vision.fallback.${i}.model`);
    const apiKey = await getKey(`vision.fallback.${i}`);
    if (!baseUrl || !model || !apiKey) break;
    configs.push({ baseUrl, model, apiKey });
  }

  return configs;
}

/** 获取已配置的备选模型数量（不含主模型）。以 base_url/model 为准（添加时先写入）。 */
export async function getFallbackCount(): Promise<number> {
  for (let i = 0; ; i++) {
    const baseUrl = await getKey(`vision.fallback.${i}.base_url`);
    const model = await getKey(`vision.fallback.${i}.model`);
    if (!baseUrl && !model) return i;
  }
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
