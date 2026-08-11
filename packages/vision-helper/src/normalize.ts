import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

/**
 * 判断输入是否为远程 URL 或 data URI，此类输入直接透传，无需读取本地文件。
 */
export function isPassthroughInput(input: string): boolean {
  return /^https?:\/\//i.test(input) || /^data:/i.test(input);
}

/**
 * 通用归一化：将本地文件路径转为 data URI，URL/data URI 直接透传。
 * @param input 本地路径 / http(s) URL / data: URI
 * @param mimeByExt 扩展名到 MIME 类型的映射表
 * @param typeLabel 错误提示用的类型名，如 "图片" / "音频"
 */
export async function normalizeToDataUri(
  input: string,
  mimeByExt: Record<string, string>,
  typeLabel: string,
): Promise<string> {
  if (isPassthroughInput(input)) {
    return input;
  }
  const buf = await readFile(input);
  const ext = extname(input).toLowerCase();
  const mime = mimeByExt[ext];
  if (!mime) {
    throw new Error(`不支持的${typeLabel}格式: ${ext}`);
  }
  return `data:${mime};base64,${buf.toString('base64')}`;
}
