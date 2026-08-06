import type { VisionConfig } from './config.js';
import { normalizeImage } from './image.js';

/** 视觉模型调用参数。 */
export interface AnalyzeParams {
  image: string;
  prompt?: string;
  detail?: 'low' | 'high';
}

/**
 * 调用 OpenAI 兼容的视觉模型分析图片，返回模型文本响应。
 * 接收本地路径、http(s) URL 或 data: base64 URI 三种图片输入。
 */
export async function analyzeImage(
  config: VisionConfig,
  params: AnalyzeParams,
): Promise<string> {
  const imageUrl = await normalizeImage(params.image);
  const detail = params.detail ?? 'high';
  const prompt = params.prompt?.trim() || '请详细描述这张图片的内容。';

  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const resp = await fetch(url, {
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
              image_url: { url: imageUrl, detail },
            },
          ],
        },
      ],
      max_tokens: 4096,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(
      `视觉模型请求失败 (HTTP ${resp.status}): ${body.slice(0, 500)}`,
    );
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('视觉模型未返回内容');
  return text;
}
