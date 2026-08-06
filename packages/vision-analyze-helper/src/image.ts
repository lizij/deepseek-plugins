import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

/** 根据文件扩展名推断 MIME 类型，未知扩展名抛出错误。 */
function guessMime(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    throw new Error(`不支持的图片格式: ${ext}`);
  }
  return mime;
}

/**
 * 将多种图片输入形式归一化为 OpenAI 兼容 API 的 image_url 格式。
 * 支持 http(s) URL、data: base64 URI、本地文件路径三种输入。
 */
export async function normalizeImage(input: string): Promise<string> {
  // http(s) URL 或 data: URI — 直接透传
  if (/^https?:\/\//i.test(input) || /^data:/i.test(input)) {
    return input;
  }
  // 本地文件路径 — 读取并转为 data URI
  const buf = await readFile(input);
  const mime = guessMime(input);
  return `data:${mime};base64,${buf.toString('base64')}`;
}
