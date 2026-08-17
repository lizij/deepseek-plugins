import { extname } from 'node:path';
import { normalizeToDataUri } from './normalize.js';

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
};

/**
 * 将视频输入归一化为 data URI（URL/data URI 直接透传，本地文件读取后 base64 编码）。
 */
export async function normalizeVideo(input: string): Promise<string> {
  return normalizeToDataUri(input, MIME_BY_EXT, '视频');
}
