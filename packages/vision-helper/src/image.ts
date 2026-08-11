import { normalizeToDataUri } from './normalize.js';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

/**
 * 将图片输入归一化为 data URI（URL/data URI 直接透传，本地文件读取后 base64 编码）。
 */
export async function normalizeImage(input: string): Promise<string> {
  return normalizeToDataUri(input, MIME_BY_EXT, '图片');
}
