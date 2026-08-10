import type { VisionConfig } from './config.js';
import { DEFAULT_PROMPT } from './config.js';
import { normalizeImage } from './image.js';

/** 视觉模型调用参数。 */
export interface AnalyzeParams {
  image: string;
  prompt?: string;
  detail?: 'low' | 'high';
}

/** 单模型超时时间（毫秒）。 */
const FETCH_TIMEOUT_MS = 120_000;

/** 全局超时时间（毫秒）：多模型容灾时的总等待上限，避免 N × 单模型超时。 */
const GLOBAL_TIMEOUT_MS = 180_000;

/** 视觉模型 API 错误，携带 HTTP 状态码用于容灾决策。 */
export class VisionApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'VisionApiError';
    this.status = status;
  }
}

/** 判断错误是否可重试（网络错误 / 超时 / 5xx / 429）。 */
function isRetryable(err: unknown): boolean {
  if (err instanceof VisionApiError) {
    return err.status >= 500 || err.status === 429;
  }
  // 非 API 错误（网络中断、超时等）均可重试
  return true;
}

/**
 * 调用 OpenAI 兼容的视觉模型分析图片，返回模型文本响应。
 * 接收本地路径、http(s) URL 或 data: base64 URI 三种图片输入。
 */
export async function analyzeImage(
  config: VisionConfig,
  params: AnalyzeParams,
  signal?: AbortSignal,
): Promise<string> {
  const imageUri = await normalizeImage(params.image);
  const detail = params.detail ?? 'high';
  const prompt = params.prompt?.trim() || DEFAULT_PROMPT;

  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  // 若外部传入全局 signal，将其与本地超时联动
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
              {
                type: 'image_url',
                image_url: { url: imageUri, detail },
              },
            ],
          },
        ],
        // 不传 max_tokens，由各 API 使用自身默认值（不同模型上限不同）
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    throw new VisionApiError(resp.status, `视觉模型请求失败 (HTTP ${resp.status})`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('视觉模型未返回内容');
  return text;
}

/**
 * 带容灾的视觉模型调用：按优先级顺序尝试多个模型配置，
 * 任一成功即返回结果，全部失败才报错。
 * 受全局超时限制，避免多模型叠加等待过长。
 */
export async function analyzeImageWithFallback(
  configs: VisionConfig[],
  params: AnalyzeParams,
): Promise<string> {
  if (configs.length === 0) {
    throw new Error('未配置任何视觉模型');
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
        return await analyzeImage(config, params, globalController.signal);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`[${config.model} @ ${config.baseUrl}] ${msg}`);
        // 不可重试的错误（如 400 参数错误）通常与模型无关，继续尝试意义不大
        if (!isRetryable(err) && err instanceof VisionApiError && err.status !== 401) {
          // 401 可能是该模型的 key 无效，其他模型可能正常，仍继续尝试
          break;
        }
      }
    }
  } finally {
    clearTimeout(globalTimer);
  }

  throw new Error(
    `所有视觉模型均调用失败 (${configs.length} 个):\n${errors.join('\n')}`,
  );
}
