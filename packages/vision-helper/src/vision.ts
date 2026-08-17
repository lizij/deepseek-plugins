import type { VisionConfig } from '@deepseek-plugins/shared/multimodal-config';
import { DEFAULT_PROMPT } from '@deepseek-plugins/shared/multimodal-config';
import { normalizeImage } from './image.js';
import { toAudioBase64 } from './audio.js';
import { normalizePdf, pdfToImages } from './pdf.js';
import { normalizeVideo } from './video.js';

/** 输入模态类型。 */
export type Modality = 'image' | 'audio' | 'pdf' | 'video';

/** 通用多模态调用参数。 */
export interface AnalyzeParams {
  input: string;
  prompt?: string;
  detail?: 'low' | 'high';
}

/** 单模型超时时间（毫秒）。 */
const FETCH_TIMEOUT_MS = 120_000;

/** 全局超时时间（毫秒）：多模型容灾时的总等待上限，避免 N × 单模型超时。 */
const GLOBAL_TIMEOUT_MS = 180_000;

/** 多模态模型 API 错误，携带 HTTP 状态码用于容灾决策。 */
export class MultimodalApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'MultimodalApiError';
    this.status = status;
  }
}

/** 兼容旧名称。 */
export type VisionApiError = MultimodalApiError;

/** 根据模态类型构造 OpenAI 兼容 API 的 content part 数组。 */
async function buildContentParts(modality: Modality, params: AnalyzeParams): Promise<Record<string, unknown>[]> {
  switch (modality) {
    case 'image': {
      const imageUri = await normalizeImage(params.input);
      const detail = params.detail ?? 'high';
      return [{ type: 'image_url', image_url: { url: imageUri, detail } }];
    }
    case 'audio': {
      const { data, format } = await toAudioBase64(params.input);
      return [{ type: 'input_audio', input_audio: { data, format } }];
    }
    case 'pdf': {
      if (/^https?:\/\//i.test(params.input) || /^data:/i.test(params.input)) {
        const dataUri = await normalizePdf(params.input);
        return [{ type: 'file_url', file_url: { url: dataUri } }];
      }
      const images = await pdfToImages(params.input);
      return images.map((url) => ({ type: 'image_url', image_url: { url } }));
    }
    case 'video': {
      const videoUri = await normalizeVideo(params.input);
      return [{ type: 'video_url', video_url: { url: videoUri } }];
    }
    default:
      throw new Error(`不支持的模态类型: ${modality}`);
  }
}

/** 各模态默认 prompt。 */
export const DEFAULT_PROMPT_BY_MODALITY: Record<Modality, string> = {
  image: DEFAULT_PROMPT,
  audio: '请逐字转写（ASR）这段音频中所说的每一句话，原样输出文字内容，不要总结、不要翻译、不要补充说明。',
  pdf: '请详细描述这个 PDF 文档的内容。',
  video: '请详细描述这段视频的内容，包括画面、动作、场景等关键信息。',
};

/**
 * 调用 OpenAI 兼容的多模态模型，返回模型文本响应。
 * 支持 image / audio / pdf 三种模态，复用同一套配置与容灾逻辑。
 */
export async function analyze(
  config: VisionConfig,
  modality: Modality,
  params: AnalyzeParams,
  signal?: AbortSignal,
): Promise<string> {
  const prompt = params.prompt?.trim() || DEFAULT_PROMPT_BY_MODALITY[modality];
  const contentParts = await buildContentParts(modality, params);

  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...contentParts,
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    let errMsg = '';
    try {
      const errBody = (await resp.json()) as { error?: { message?: string }; message?: string };
      errMsg = errBody?.error?.message || errBody?.message || JSON.stringify(errBody);
    } catch {
      try {
        errMsg = await resp.text();
      } catch {
        errMsg = '';
      }
    }
    throw new MultimodalApiError(resp.status, `多模态模型请求失败 (HTTP ${resp.status})${errMsg ? ': ' + errMsg : ''}`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('多模态模型未返回内容');
  return text;
}

/**
 * 带容灾的多模态模型调用：按优先级顺序尝试多个模型配置，
 * 任一成功即返回结果，全部失败才报错。
 * 受全局超时限制，避免多模型叠加等待过长。
 */
export async function analyzeWithFallback(
  configs: VisionConfig[],
  modality: Modality,
  params: AnalyzeParams,
): Promise<string> {
  if (configs.length === 0) {
    throw new Error('未配置任何多模态模型');
  }

  const globalController = new AbortController();
  const globalTimer = setTimeout(() => globalController.abort(), GLOBAL_TIMEOUT_MS);

  const errors: string[] = [];
  try {
    for (const config of configs) {
      if (globalController.signal.aborted) {
        errors.push(`[${config.model} @ ${config.baseUrl}] 全局超时，跳过`);
        continue;
      }
      try {
        return await analyze(config, modality, params, globalController.signal);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`[${config.model} @ ${config.baseUrl}] ${msg}`);
        // 每个模型有独立的 API Key，任何错误都继续尝试下一个模型
      }
    }
  } finally {
    clearTimeout(globalTimer);
  }

  throw new Error(
    `所有多模态模型均调用失败 (${configs.length} 个):\n${errors.join('\n')}`,
  );
}

/** 兼容旧接口：分析图片。 */
export async function analyzeImage(
  config: VisionConfig,
  params: { image: string; prompt?: string; detail?: 'low' | 'high' },
  signal?: AbortSignal,
): Promise<string> {
  return analyze(config, 'image', { input: params.image, prompt: params.prompt, detail: params.detail }, signal);
}

/** 兼容旧接口：带容灾的图片分析。 */
export async function analyzeImageWithFallback(
  configs: VisionConfig[],
  params: { image: string; prompt?: string; detail?: 'low' | 'high' },
): Promise<string> {
  return analyzeWithFallback(configs, 'image', { input: params.image, prompt: params.prompt, detail: params.detail });
}
