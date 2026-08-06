import { getKey } from '@deepseek-plugins/shared';

/** 视觉模型调用所需配置，所有配置均从 Keychain 读取。 */
export interface VisionConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

/**
 * 读取视觉模型配置。
 * base_url / model / API Key 均从 Keychain 读取。
 * 任一缺失返回 null，调用方负责给出明确错误提示。
 */
export async function loadConfig(): Promise<VisionConfig | null> {
  const baseUrl = await getKey('vision.base_url');
  const model = await getKey('vision.model');
  const apiKey = await getKey('vision');
  if (!baseUrl || !model || !apiKey) return null;
  return { baseUrl, model, apiKey };
}

/** 生成缺失配置时的引导提示文本。 */
export function missingConfigHint(): string {
  return [
    '视觉模型未配置，请按以下步骤设置：',
    '1. 设置 API Key（交互式输入，存入 Keychain）：',
    '   deepseek-plugin-cli auth set vision',
    '2. 配置 base_url 与 model：',
    '   deepseek-plugin-cli vision config --base-url https://api.openai.com/v1 --model gpt-4o',
  ].join('\n');
}
